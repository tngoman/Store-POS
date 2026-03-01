/**
 * PayTheFly Crypto Payment API for Store-POS
 *
 * Enables cryptocurrency payment acceptance at point of sale via PayTheFly.
 * Supports BSC (chainId=56, 18 decimals) and TRON (chainId=728126428, 6 decimals).
 *
 * Configuration is stored in the settings database and can be managed
 * via the /api/paythefly/settings endpoint.
 *
 * Environment variables (alternative to DB settings):
 *   PAYTHEFLY_PROJECT_ID    - PayTheFly project identifier
 *   PAYTHEFLY_PROJECT_KEY   - HMAC-SHA256 key for webhook verification
 *   PAYTHEFLY_CHAIN_ID      - Blockchain chain ID (default: 56 for BSC)
 *   PAYTHEFLY_TOKEN_ADDRESS - Payment token contract address
 *
 * PayTheFly API Specification:
 *   - EIP-712 domain: { name: "PayTheFlyPro", version: "1" }
 *   - Payment URL: https://pro.paythefly.com/pay?chainId=56&projectId=...&amount=0.01&...
 *   - Amount is human-readable (e.g., "0.01"), NOT raw token units
 *   - Webhook body: { "data": "<json>", "sign": "<hmac hex>", "timestamp": <unix> }
 *   - Webhook signature: HMAC-SHA256(data + "." + timestamp, projectKey)
 *   - Webhook response must contain "success" string
 *   - Payload fields: value (not amount), confirmed (not status), serial_no, tx_hash, wallet, tx_type
 *   - tx_type: 1=payment, 2=withdrawal
 */

let app = require("express")();
let bodyParser = require("body-parser");
let Datastore = require("nedb");
let crypto = require("crypto");

app.use(bodyParser.json());

module.exports = app;

// PayTheFly orders database
let payTheFlyDB = new Datastore({
    filename: process.env.APPDATA + "/POS/server/databases/paythefly_orders.db",
    autoload: true,
});

payTheFlyDB.ensureIndex({ fieldName: "serial_no", unique: true });

// PayTheFly settings database
let payTheFlySettingsDB = new Datastore({
    filename: process.env.APPDATA + "/POS/server/databases/paythefly_settings.db",
    autoload: true,
});

/**
 * Get PayTheFly configuration from DB or environment variables
 */
function getConfig(callback) {
    payTheFlySettingsDB.findOne({ _id: "config" }, function (err, doc) {
        if (doc) {
            callback(null, doc);
        } else {
            // Fallback to environment variables
            callback(null, {
                project_id: process.env.PAYTHEFLY_PROJECT_ID || "",
                project_key: process.env.PAYTHEFLY_PROJECT_KEY || "",
                chain_id: parseInt(process.env.PAYTHEFLY_CHAIN_ID || "56"),
                token_address: process.env.PAYTHEFLY_TOKEN_ADDRESS || "",
                enabled: !!(process.env.PAYTHEFLY_PROJECT_ID && process.env.PAYTHEFLY_PROJECT_KEY),
            });
        }
    });
}

/**
 * Verify PayTheFly webhook HMAC-SHA256 signature using timing-safe comparison.
 * Signature = HMAC-SHA256(data + "." + timestamp, projectKey)
 *
 * IMPORTANT: Uses HMAC-SHA256 (standard SHA-256), NOT SHA3-256.
 */
function verifySignature(data, timestamp, signature, projectKey) {
    if (!projectKey) {
        console.error("[PayTheFly] Project key not configured");
        return false;
    }

    let message = data + "." + timestamp;
    let expectedSignature = crypto
        .createHmac("sha256", projectKey)
        .update(message)
        .digest("hex");

    // Timing-safe comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, "hex"),
            Buffer.from(signature, "hex")
        );
    } catch (err) {
        console.error("[PayTheFly] Signature comparison error:", err.message);
        return false;
    }
}

// ==================== API Routes ====================

app.get("/", function (req, res) {
    res.send("PayTheFly Crypto Payment API");
});

/**
 * GET /api/paythefly/settings
 * Returns current PayTheFly configuration (project_key is masked)
 */
app.get("/settings", function (req, res) {
    getConfig(function (err, config) {
        if (err) return res.status(500).send(err);
        res.send({
            project_id: config.project_id,
            chain_id: config.chain_id,
            token_address: config.token_address,
            enabled: config.enabled,
            project_key_set: !!config.project_key,
        });
    });
});

/**
 * POST /api/paythefly/settings
 * Update PayTheFly configuration
 */
app.post("/settings", function (req, res) {
    let settings = {
        _id: "config",
        project_id: req.body.project_id || "",
        project_key: req.body.project_key || "",
        chain_id: parseInt(req.body.chain_id || "56"),
        token_address: req.body.token_address || "",
        enabled: !!req.body.enabled,
    };

    payTheFlySettingsDB.update(
        { _id: "config" },
        settings,
        { upsert: true },
        function (err) {
            if (err) res.status(500).send(err);
            else res.sendStatus(200);
        }
    );
});

/**
 * POST /api/paythefly/create-order
 * Create a new crypto payment order for a POS transaction
 *
 * Body: { transaction_id, amount, customer_name? }
 * Returns: { serial_no, amount, deadline, chain_id, project_id, token_address, payment_url }
 */
app.post("/create-order", function (req, res) {
    getConfig(function (err, config) {
        if (err || !config.enabled) {
            return res.status(400).json({ error: "PayTheFly is not enabled" });
        }

        if (!config.project_id || !config.token_address) {
            return res.status(400).json({ error: "PayTheFly is not configured" });
        }

        let amount = req.body.amount;
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        let serialNo = crypto.randomBytes(32).toString("hex");
        let deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

        let order = {
            serial_no: serialNo,
            transaction_id: req.body.transaction_id || null,
            customer_name: req.body.customer_name || "",
            amount: amount.toString(),
            chain_id: config.chain_id,
            deadline: deadline,
            status: "pending",
            tx_hash: null,
            wallet: null,
            paid_value: null,
            created_at: new Date().toJSON(),
            updated_at: null,
        };

        payTheFlyDB.insert(order, function (err, doc) {
            if (err) {
                return res.status(500).json({ error: "Failed to create order" });
            }

            // Build payment URL (amount is human-readable, NOT raw units)
            let paymentURL =
                "https://pro.paythefly.com/pay" +
                "?chainId=" + config.chain_id +
                "&projectId=" + encodeURIComponent(config.project_id) +
                "&amount=" + encodeURIComponent(amount.toString()) +
                "&serialNo=" + encodeURIComponent(serialNo) +
                "&deadline=" + deadline +
                "&token=" + encodeURIComponent(config.token_address);

            res.status(200).json({
                status: true,
                serial_no: serialNo,
                amount: amount.toString(),
                deadline: deadline,
                chain_id: config.chain_id,
                project_id: config.project_id,
                token_address: config.token_address,
                payment_url: paymentURL,
            });
        });
    });
});

/**
 * POST /api/paythefly/webhook
 * Receives payment confirmations from PayTheFly.
 *
 * Webhook body: { "data": "<json string>", "sign": "<hmac hex>", "timestamp": <unix> }
 * Signature: HMAC-SHA256(data + "." + timestamp, projectKey)
 * Response MUST contain "success" string.
 *
 * Webhook payload fields:
 *   - value: payment amount (human-readable, NOT "amount")
 *   - confirmed: boolean (NOT "status")
 *   - serial_no: unique serial number
 *   - tx_hash: blockchain transaction hash
 *   - wallet: payer wallet address
 *   - tx_type: 1=payment, 2=withdrawal
 */
app.post("/webhook", function (req, res) {
    let body = req.body;

    // Validate webhook structure
    if (!body || !body.data || !body.sign || body.timestamp === undefined) {
        console.error("[PayTheFly] Invalid webhook body");
        return res.status(400).send("invalid request");
    }

    getConfig(function (err, config) {
        if (err || !config.enabled) {
            // Always return success to prevent retries
            return res.status(200).send("success");
        }

        // Verify HMAC-SHA256 signature (timing-safe)
        if (!verifySignature(body.data, body.timestamp, body.sign, config.project_key)) {
            console.error("[PayTheFly] Signature verification failed");
            return res.status(403).send("invalid signature");
        }

        // Reject stale webhooks (> 5 minutes)
        let now = Math.floor(Date.now() / 1000);
        if (now - body.timestamp > 300) {
            console.error("[PayTheFly] Timestamp too old");
            return res.status(400).send("timestamp expired");
        }

        // Parse inner payload
        let payload;
        try {
            payload = JSON.parse(body.data);
        } catch (parseErr) {
            console.error("[PayTheFly] Failed to parse data:", parseErr.message);
            return res.status(400).send("invalid data");
        }

        // Only process confirmed payment transactions (tx_type=1)
        if (payload.tx_type === 1 && payload.confirmed) {
            payTheFlyDB.findOne({ serial_no: payload.serial_no }, function (findErr, order) {
                if (!order) {
                    console.error("[PayTheFly] Order not found:", payload.serial_no);
                } else if (order.status !== "pending") {
                    console.log("[PayTheFly] Order already processed:", payload.serial_no);
                } else {
                    payTheFlyDB.update(
                        { serial_no: payload.serial_no, status: "pending" },
                        {
                            $set: {
                                status: "completed",
                                tx_hash: payload.tx_hash,
                                wallet: payload.wallet,
                                paid_value: payload.value,
                                updated_at: new Date().toJSON(),
                            },
                        },
                        {},
                        function (updateErr) {
                            if (updateErr) {
                                console.error("[PayTheFly] Update error:", updateErr);
                            } else {
                                console.log(
                                    "[PayTheFly] Payment confirmed: serial_no=" +
                                        payload.serial_no +
                                        " tx=" +
                                        payload.tx_hash +
                                        " value=" +
                                        payload.value
                                );
                            }
                        }
                    );
                }
            });
        } else {
            console.log(
                "[PayTheFly] Skipping: tx_type=" +
                    payload.tx_type +
                    " confirmed=" +
                    payload.confirmed
            );
        }

        // Response MUST contain "success" per PayTheFly API spec
        res.status(200).send("success");
    });
});

/**
 * GET /api/paythefly/order-status?serial_no=xxx
 * Check the status of a payment order
 */
app.get("/order-status", function (req, res) {
    let serialNo = req.query.serial_no;
    if (!serialNo) {
        return res.status(400).json({ error: "serial_no is required" });
    }

    payTheFlyDB.findOne({ serial_no: serialNo }, function (err, order) {
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        res.status(200).json({
            status: true,
            serial_no: order.serial_no,
            order_status: order.status,
            amount: order.amount,
            tx_hash: order.tx_hash,
            wallet: order.wallet,
            paid_value: order.paid_value,
            completed: order.status === "completed",
            created_at: order.created_at,
        });
    });
});

/**
 * GET /api/paythefly/orders
 * List all PayTheFly payment orders (for reporting)
 */
app.get("/orders", function (req, res) {
    let query = {};
    if (req.query.status) {
        query.status = req.query.status;
    }

    payTheFlyDB
        .find(query)
        .sort({ created_at: -1 })
        .exec(function (err, docs) {
            if (err) return res.status(500).send(err);
            res.send(docs);
        });
});
