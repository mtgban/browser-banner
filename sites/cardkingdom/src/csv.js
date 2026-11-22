// Writes the history and the carts out as CSV, byte for byte what Go's
// csv.Writer writes for the same rows: the same quoting, one LF per row.
//
// The history's five columns and their header are a contract: spreadsheets
// already built on that file read them by name. Every value in it is written
// as Card Kingdom prints it.

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  // [header, field of a history row]
  var COLUMNS = [
    ["Order ID", "orderID"],
    ["Order Status", "status"],
    ["Order Date", "orderDate"],
    ["Completed on", "completedOn"],
    ["Amount", "amount"],
  ];

  // table writes a header and one line per row of values, quoted by
  // core/csv.js, every row ended by LF.
  function table(header, rows) {
    return BAN.csv([header].concat(rows), "\n");
  }

  // toCSV writes the header and one line per history row, in the order given.
  CKB.toCSV = function (rows) {
    return table(CKB.csvColumns(), rows.map(function (r) {
      return COLUMNS.map(function (column) {
        return r[column[1]];
      });
    }));
  };

  function decimal(cents) {
    return cents === null ? "" : Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
  }

  // The cart file's columns, named so that mtgban's uploader reads them: the
  // Scryfall id of the line's row in the price list, then the line as the
  // page shows it, prices in plain dollars, and the product id, the row's
  // when the page gives none. found is that row and whether it is foil, or
  // null. A line the page could not read whole is written with what was
  // read.
  var CART = [
    ["Scryfall ID", function (l, found) {
      return found ? found.row.scryfall : "";
    }],
    ["Name", function (l) { return l.name; }],
    ["Edition", function (l) { return l.edition; }],
    ["Foil", function (l, found) { return (found ? found.foil : l.foil) ? "Yes" : "No"; }],
    ["Condition", function (l) { return l.condition; }],
    ["Quantity", function (l) { return l.qty; }],
    ["Price", function (l) { return decimal(l.each); }],
    ["Total", function (l) { return decimal(l.total); }],
    ["CK ID", function (l, found) {
      return found ? found.row.id : l.productID;
    }],
  ];

  // lineTable writes lines in the order given, each with what find(line)
  // found of it in the price list.
  function lineTable(lines, find) {
    return table(CART.map(function (column) {
      return column[0];
    }), lines.map(function (l) {
      var found = find(l);
      return CART.map(function (column) {
        return column[1](l, found);
      });
    }));
  }

  // cartCSV writes a cart's lines, as readCart reads them, in the page's
  // order, with each line's Scryfall id from list when one is given: the
  // row its product id names, when that is the line's card, or, for a line
  // with no id (a signed-out cart), the one row of its card.
  CKB.cartCSV = function (lines, list) {
    return lineTable(lines, function (l) {
      var row = list ? CKB.rowFor(l, list).row : null;
      return row ? { row: row, foil: l.foil } : null;
    });
  };

  // invoiceCSV writes an invoice's lines, as readSellInvoice reads them, in
  // the page's order, under the cart's columns, each with its row in list
  // when one is given and invoiceRow finds it.
  CKB.invoiceCSV = function (lines, list) {
    return lineTable(lines, function (l) {
      return list ? CKB.invoiceRow(l, list) : null;
    });
  };

  // purchaseCSV writes a purchase invoice's lines, as readPurchaseInvoice
  // reads them, the same way: a line purchaseRow finds is written with the
  // name and edition it split the card into, and one it does not with the
  // card whole as its name and no edition.
  CKB.purchaseCSV = function (lines, list) {
    var found = [];
    var named = lines.map(function (l) {
      var f = list ? CKB.purchaseRow(l, list) : null;
      found.push(f);
      return f ? Object.assign({}, l, { name: f.name, edition: f.edition }) : l;
    });
    var i = 0;
    return lineTable(named, function () {
      return found[i++];
    });
  };

  CKB.csvColumns = function () {
    var names = [];
    for (var i = 0; i < COLUMNS.length; i++) {
      names.push(COLUMNS[i][0]);
    }
    return names;
  };
})(globalThis.CKB, globalThis.BAN);
