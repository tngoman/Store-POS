let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("nedb");
let Inventory = require("./inventory");

app.use(bodyParser.json());

module.exports = app;
 
let transactionsDB = new Datastore({
  filename: process.env.APPDATA+"/POS/server/databases/transactions.db",
  autoload: true
});


transactionsDB.ensureIndex({ fieldName: '_id', unique: true });

app.get("/", function(req, res) {
  res.send("Transactions API");
});

 
app.get("/all", function(req, res) {
  transactionsDB.find({}, function(err, docs) {
    res.send(docs);
  });
});

 
app.get("/limit", function(req, res) {
  let limit = parseInt(req.query.limit, 10);
  if (!limit) limit = 5;

  transactionsDB.find({})
    .limit(limit)
    .sort({ date: -1 })
    .exec(function(err, docs) {
      res.send(docs);
    });
});

 
app.get("/day-total", function(req, res) {
  // if date is provided
  if (req.query.date) {
    startDate = new Date(req.query.date);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(req.query.date);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // beginning of current day
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // end of current day
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  transactionsDB.find(
    { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
    function(err, docs) {
      let result = {
        date: startDate
      };

      if (docs) {
        let total = docs.reduce(function(p, c) {
          return p + c.total;
        }, 0.0);

        result.total = parseFloat(parseFloat(total).toFixed(2));

        res.send(result);
      } else {
        result.total = 0;
        res.send(result);
      }
    }
  );
});


 
app.get("/on-hold", function(req, res) {
  transactionsDB.find(
    { $and: [{ ref_number: {$ne: ""}}, { status: 0  }]},    
    function(err, docs) {
      if (docs) res.send(docs);
    }
  );
});



app.get("/customer-orders", function(req, res) {
  transactionsDB.find(
    { $and: [{ customer: {$ne: "0"} }, { status: 0}, { ref_number: ""}]},
    function(err, docs) {
      if (docs) res.send(docs);
    }
  );
});



app.get("/by-date", function(req, res) {

  let startDate = new Date(req.query.start);
  let endDate = new Date(req.query.end);

  if(req.query.user == 0 && req.query.till == 0) {
      transactionsDB.find(
        { $and: [{ date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() }}, { status: parseInt(req.query.status) }] },
        function(err, docs) {
          if (docs) res.send(docs);
        }
      );
  }

  if(req.query.user != 0 && req.query.till == 0) {
    transactionsDB.find(
      { $and: [{ date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() }}, { status: parseInt(req.query.status) }, { user_id: parseInt(req.query.user) }] },
      function(err, docs) {
        if (docs) res.send(docs);
      }
    );
  }

  if(req.query.user == 0 && req.query.till != 0) {
    transactionsDB.find(
      { $and: [{ date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() }}, { status: parseInt(req.query.status) }, { till: parseInt(req.query.till) }] },
      function(err, docs) {
        if (docs) res.send(docs);
      }
    );
  }

  if(req.query.user != 0 && req.query.till != 0) {
    transactionsDB.find(
      { $and: [{ date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() }}, { status: parseInt(req.query.status) }, { till: parseInt(req.query.till) }, { user_id: parseInt(req.query.user) }] },
      function(err, docs) {
        if (docs) res.send(docs);
      }
    );
  }

});



app.post("/new", function(req, res) {
  let newTransaction = req.body;
  transactionsDB.insert(newTransaction, function(err, transaction) {    
    if (err) res.status(500).send(err);
    else {
     res.sendStatus(200);

     if(newTransaction.paid >= newTransaction.total){
        Inventory.decrementInventory(newTransaction.items);
     }
     
    }
  });
});



app.put("/new", function(req, res) {
  let oderId = req.body._id;
  transactionsDB.update( {
      _id: oderId
  }, req.body, {}, function (
      err,
      numReplaced,
      order
  ) {
      if ( err ) res.status( 500 ).send( err );
      else res.sendStatus( 200 );
  } );
});


app.post( "/delete", function ( req, res ) {
 let transaction = req.body;
  transactionsDB.remove( {
      _id: transaction.orderId
  }, function ( err, numRemoved ) {
      if ( err ) res.status( 500 ).send( err );
      else res.sendStatus( 200 );
  } );
} );



app.get("/:transactionId", function(req, res) {
  transactionsDB.find({ _id: req.params.transactionId }, function(err, doc) {
    if (doc) res.send(doc[0]);
  });
});
