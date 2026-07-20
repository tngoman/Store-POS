import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  CartItem,
  Category,
  Customer,
  Product,
  Settings,
  Transaction,
  getUploadsBase,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import PaymentPad from '../components/PaymentPad';
import CustomerSelect from '../components/CustomerSelect';

type Props = {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  settings: Settings | null;
  onRefresh: () => Promise<void>;
  holdCount: number;
  onHoldCount: (n: number) => void;
};

export default function TillView({
  products,
  categories,
  customers,
  settings,
  onRefresh,
  holdCount,
  onHoldCount,
}: Props) {
  const { user, apiInfo } = useAuth();
  const scanRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [customerId, setCustomerId] = useState('0');
  const [discount, setDiscount] = useState(0);
  const [activeHoldId, setActiveHoldId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHolds, setShowHolds] = useState(false);
  const [holds, setHolds] = useState<Transaction[]>([]);
  const [showPay, setShowPay] = useState(false);
  const [paid, setPaid] = useState('');
  const [paymentType, setPaymentType] = useState(1);
  const [receipt, setReceipt] = useState('');

  const symbol = settings?.symbol || '$';
  const taxRate = settings?.charge_tax ? Number(settings.percentage) || 0 : 0;
  const uploads = getUploadsBase();

  const refreshHolds = async () => {
    const list = await api.getOnHold();
    setHolds(list);
    onHoldCount(list.length);
  };

  useEffect(() => {
    refreshHolds().catch(() => undefined);
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length) openPay();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        openHolds();
      }
      if (e.key === 'Escape' && showPay) {
        setShowPay(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart, showPay]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    // While typing a barcode, keep the grid browsable by category only if empty query feels better
    return products.filter((p) => {
      const catOk = categoryFilter === 'all' || p.category === categoryFilter;
      if (!q) return catOk;
      return (
        catOk &&
        (p.name.toLowerCase().includes(q) || String(p.id).includes(q))
      );
    });
  }, [products, query, categoryFilter]);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const afterDiscount = Math.max(0, subtotal - (Number(discount) || 0));
  const tax = afterDiscount * (taxRate / 100);
  const total = afterDiscount + tax;
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const stockLabel = (p: Product) => {
    if (!p.stock) return { text: 'No stock limit', className: 'stock-badge' };
    if (p.quantity <= 0) return { text: 'Out of stock', className: 'stock-badge out' };
    if (p.quantity <= 5) return { text: `${p.quantity} left`, className: 'stock-badge low' };
    return { text: `${p.quantity} in stock`, className: 'stock-badge' };
  };

  const addToCart = (product: Product) => {
    if (product.stock && product.quantity <= 0) {
      setError(`${product.name} is out of stock`);
      return;
    }
    setError(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (product.stock && existing.quantity >= product.quantity) {
          setError(`Only ${product.quantity} available for ${product.name}`);
          return prev;
        }
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          stock: product.quantity,
        },
      ];
    });
  };

  const setQty = (id: number, quantity: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setActiveHoldId(null);
    setCustomerId('0');
    setError(null);
    scanRef.current?.focus();
  };

  const onScan = async () => {
    const code = query.trim();
    if (!code) return;
    try {
      const product = await api.findBySku(code);
      if (product) {
        addToCart(product);
        setQuery('');
        scanRef.current?.focus();
        return;
      }
      // fallback local match by id or exact name
      const local =
        products.find((p) => String(p.id) === code) ||
        products.find((p) => p.name.toLowerCase() === code.toLowerCase());
      if (local) {
        addToCart(local);
        setQuery('');
        scanRef.current?.focus();
      } else {
        setError(`No product for “${code}”`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    }
  };

  const buildTransaction = (status: number, paidAmount: number, changeAmt: number) => {
    const customer = customers.find((c) => String(c.id) === customerId);
    return {
      ref_number: status === 0 ? `H-${Date.now().toString().slice(-6)}` : '',
      customer: customerId,
      customer_name: customer?.name || 'Walk-in',
      status,
      user_id: user?._id || 0,
      user: user?.fullname || '',
      till: apiInfo?.till || settings?.till || 1,
      discount: Number(discount) || 0,
      subtotal,
      tax,
      total,
      paid: paidAmount,
      change: changeAmt,
      payment_type: paymentType,
      items: cart,
      date: new Date().toISOString(),
    };
  };

  const holdSale = async () => {
    if (!cart.length) return;
    try {
      const body = buildTransaction(0, 0, 0);
      if (activeHoldId) {
        await api.updateTransaction({ ...body, _id: activeHoldId });
      } else {
        await api.createTransaction(body);
      }
      clearCart();
      await refreshHolds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not hold sale');
    }
  };

  const openPay = () => {
    // Cash starts empty so the numpad builds the tendered amount (not appends to total).
    setPaid('');
    setPaymentType(1);
    setShowPay(true);
  };

  const sanitizeTendered = (raw: string) => {
    let next = raw.replace(/[^\d.]/g, '');
    const firstDot = next.indexOf('.');
    if (firstDot !== -1) {
      next =
        next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, '');
      const [whole, dec = ''] = next.split('.');
      next = `${whole}.${dec.slice(0, 2)}`;
    }
    return next;
  };

  const completeSale = async () => {
    const paidNum = parseFloat(paid) || 0;
    if (paidNum + 0.0001 < total) {
      setError('Amount tendered is less than total');
      return;
    }
    const changeAmt = Math.max(0, paidNum - total);
    const body = buildTransaction(1, paidNum, changeAmt);
    try {
      if (activeHoldId) {
        await api.updateTransaction({ ...body, _id: activeHoldId, ref_number: '' });
      } else {
        await api.createTransaction(body);
      }
      const lines = [
        settings?.store || 'Store POS',
        settings?.address_one || '',
        settings?.contact || '',
        '--------------------------------',
        ...cart.map(
          (i) =>
            `${i.quantity} x ${i.name}`.padEnd(22) +
            `${symbol}${(i.price * i.quantity).toFixed(2)}`
        ),
        '--------------------------------',
        `Subtotal ${symbol}${subtotal.toFixed(2)}`,
        taxRate ? `Tax ${taxRate}% ${symbol}${tax.toFixed(2)}` : '',
        discount ? `Discount -${symbol}${Number(discount).toFixed(2)}` : '',
        `TOTAL ${symbol}${total.toFixed(2)}`,
        `${paymentType === 3 ? 'Card' : 'Cash'} ${symbol}${paidNum.toFixed(2)}`,
        `Change ${symbol}${changeAmt.toFixed(2)}`,
        `Till ${apiInfo?.till || 1} · ${user?.fullname || ''}`,
        settings?.footer || 'Thank you',
        new Date().toLocaleString(),
      ]
        .filter(Boolean)
        .join('\n');
      setReceipt(lines);
      clearCart();
      setShowPay(false);
      await onRefresh();
      await refreshHolds();
      setTimeout(() => window.print(), 150);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed');
    }
  };

  const openHolds = async () => {
    await refreshHolds();
    setShowHolds(true);
  };

  const restoreHold = (order: Transaction) => {
    setCart(order.items || []);
    setCustomerId(String(order.customer || '0'));
    setDiscount(order.discount || 0);
    setActiveHoldId(order.id);
    setShowHolds(false);
    scanRef.current?.focus();
  };

  const discardHold = async (id: number) => {
    if (!confirm('Delete this held sale?')) return;
    await api.deleteTransaction(id);
    await refreshHolds();
  };

  return (
    <>
      {error && (
        <div className="error">
          {error}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="till">
        <section className="panel till-left">
          <div className="scan-bar">
            <input
              ref={scanRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onScan();
              }}
              placeholder="Scan barcode or search — Enter to add"
              autoFocus
            />
            <button type="button" className="btn btn-primary" onClick={onScan}>
              Add
            </button>
          </div>
          <div className="chips">
            <button
              type="button"
              className={`chip ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${categoryFilter === c.name ? 'active' : ''}`}
                onClick={() => setCategoryFilter(c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {filteredProducts.map((p) => {
              const stock = stockLabel(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="product-tile"
                  onClick={() => addToCart(p)}
                  disabled={!!p.stock && p.quantity <= 0}
                >
                  {p.img ? (
                    <div className="product-thumb-wrap">
                      <img className="product-thumb" src={`${uploads}/${p.img}`} alt="" />
                    </div>
                  ) : (
                    <div className="product-thumb-wrap">
                      <div className="product-thumb placeholder" />
                    </div>
                  )}
                  <div className="product-tile-body">
                    <strong>{p.name}</strong>
                    <span className="price">
                      {symbol}
                      {Number(p.price).toFixed(2)}
                    </span>
                    <span className={stock.className}>{stock.text}</span>
                  </div>
                </button>
              );
            })}
            {!filteredProducts.length && (
              <div className="empty">No products here. Add items in Catalog.</div>
            )}
          </div>
        </section>

        <section className="panel till-right">
          <div className="cart-head">
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              onCustomersChanged={onRefresh}
            />
            <button type="button" className="btn" onClick={openHolds}>
              Held {holdCount ? `(${holdCount})` : ''}
              <span className="kbd">F4</span>
            </button>
          </div>

          <div className="cart-list">
            {cart.map((item) => (
              <div className="cart-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <div className="muted">
                    {symbol}
                    {item.price.toFixed(2)} each
                  </div>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => setQty(item.id, item.quantity - 1)}>
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => setQty(item.id, item.quantity + 1)}>
                    +
                  </button>
                </div>
                <strong>
                  {symbol}
                  {(item.price * item.quantity).toFixed(2)}
                </strong>
              </div>
            ))}
            {!cart.length && (
              <div className="empty">Cart empty — scan or tap a product</div>
            )}
          </div>

          <div className="totals">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Discount ({symbol})</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div className="row">
              <span>
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>
              <span>
                {symbol}
                {subtotal.toFixed(2)}
              </span>
            </div>
            {!!taxRate && (
              <div className="row">
                <span>Tax {taxRate}%</span>
                <span>
                  {symbol}
                  {tax.toFixed(2)}
                </span>
              </div>
            )}
            <div className="row grand">
              <span>Total</span>
              <span>
                {symbol}
                {total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="cart-actions">
            <button type="button" className="btn" onClick={clearCart} disabled={!cart.length}>
              Clear
            </button>
            <button type="button" className="btn" onClick={holdSale} disabled={!cart.length}>
              Hold
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg pay"
              onClick={openPay}
              disabled={!cart.length}
            >
              Charge {symbol}
              {total.toFixed(2)}
              <span className="kbd">F2</span>
            </button>
          </div>
        </section>
      </div>

      <pre id="receipt-print" className="receipt" style={{ display: receipt ? 'block' : 'none' }}>
        {receipt}
      </pre>

      <Modal
        title="Payment"
        open={showPay}
        onClose={() => setShowPay(false)}
        compact
        footer={
          <>
            <button type="button" className="btn" onClick={() => setShowPay(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={completeSale}>
              Pay
            </button>
          </>
        }
      >
        <div className="field">
          <label>Method</label>
          <select
            value={paymentType}
            onChange={(e) => {
              const type = Number(e.target.value);
              setPaymentType(type);
              if (type === 3) setPaid(total.toFixed(2));
              else setPaid('');
            }}
          >
            <option value={1}>Cash</option>
            <option value={3}>Card</option>
          </select>
        </div>
        <div className="pay-due">
          Due {symbol}
          {total.toFixed(2)}
        </div>
        <div className="field">
          <label>Tendered</label>
          <input
            value={paid}
            onChange={(e) => setPaid(sanitizeTendered(e.target.value))}
            placeholder={paymentType === 1 ? 'Enter amount received' : total.toFixed(2)}
            inputMode="decimal"
            autoFocus
            readOnly={paymentType === 3}
          />
        </div>
        {paymentType === 1 && (
          <PaymentPad value={paid} onChange={setPaid} due={total} symbol={symbol} />
        )}
        <p className="pay-change">
          {(parseFloat(paid) || 0) + 0.0001 < total ? 'Still due' : 'Change'}{' '}
          <strong>
            {symbol}
            {Math.abs((parseFloat(paid) || 0) - total).toFixed(2)}
          </strong>
        </p>
      </Modal>

      <Modal title="Held sales" open={showHolds} onClose={() => setShowHolds(false)} wide>
        <table className="table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => (
              <tr key={h.id}>
                <td>{h.ref_number || h.id}</td>
                <td>{h.customer_name}</td>
                <td>{(h.items || []).reduce((n, i) => n + i.quantity, 0)}</td>
                <td>
                  {symbol}
                  {Number(h.total).toFixed(2)}
                </td>
                <td>{new Date(h.date).toLocaleString()}</td>
                <td>
                  <button type="button" className="btn btn-primary" onClick={() => restoreHold(h)}>
                    Resume
                  </button>{' '}
                  <button type="button" className="btn btn-danger" onClick={() => discardHold(h.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!holds.length && <div className="empty">No held sales</div>}
      </Modal>
    </>
  );
}
