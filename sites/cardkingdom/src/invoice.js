// Reads Card Kingdom's invoices (SPECIFICATIONS.md, section 17). A sell
// invoice, /myaccount/po_invoice/<id>, groups its lines under their edition,
// " Foil" ending the heading of a foil one, each "2 NM @ $1.30" and its total.
// A purchase invoice, /myaccount/invoice/<id>, writes each line's card as
// "Name (Variation): Edition", " Foil" after a foil's edition, then its
// condition, quantity, price and total in cells of their own.

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  var QTY_PRICE = /^(\d+) (NM|EX|VG|G) @ (\$[\d,]+\.\d{2})$/;

  // A variation naming Foil, not Non-Foil: "Judge Foil", "2050 - Foil".
  var SAYS_FOIL = /(^|[^-])\bFoil\b/;

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function cells(tr) {
    var found = [];
    for (var i = 0; i < tr.children.length; i++) {
      if (tr.children[i].tagName === "TD") {
        found.push(tr.children[i]);
      }
    }
    return found;
  }

  // readSellInvoice answers { lines, unreadable }, or null on a page with no
  // invoice table. Each line is { name, edition, foil, condition, qty, each,
  // total, productID }, in the page's order: the name as printed, variation
  // and all, and productID null, as the invoice names no product. A line
  // that cannot be read whole, or whose total is not its quantity times its
  // price, is counted in unreadable and not kept.
  CKB.readSellInvoice = function (doc) {
    var table = doc.querySelector("table.orderContents");
    if (!table) {
      return null;
    }
    var lines = [];
    var unreadable = 0;
    var edition = "";
    var foil = false;
    var rows = table.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
      var td = cells(rows[i]);
      if (td.length === 1 && td[0].getAttribute("colspan") === "3") {
        var heading = text(td[0]);
        foil = / Foil$/.test(heading);
        edition = foil ? heading.slice(0, -" Foil".length) : heading;
        continue;
      }
      if (td.length !== 3 || !td[0].classList.contains("Description")) {
        continue;
      }
      var name = text(td[0]);
      var m = QTY_PRICE.exec(text(td[1]));
      var each = m ? BAN.cents(m[3]) : null;
      var total = BAN.cents(text(td[2]));
      if (!name || !edition || !m || each === null || total === null || total !== Number(m[1]) * each) {
        unreadable++;
        continue;
      }
      lines.push({
        name: name,
        edition: edition,
        foil: foil,
        condition: m[2],
        qty: Number(m[1]),
        each: each,
        total: total,
        productID: null,
      });
    }
    return { lines: lines, unreadable: unreadable };
  };

  // invoiceRow is the list's one row for an invoice line, { row, foil }, or
  // null when no row or more than one is that card. A line under a heading
  // without Foil whose variation says Foil is looked for as a foil too: the
  // list writes no edition with Foil, and lists no printing whose variation
  // says Foil both ways.
  CKB.invoiceRow = function (line, list) {
    var row = CKB.findCard(list, CKB.lineKey(line));
    if (row) {
      return { row: row, foil: line.foil };
    }
    var variation = /\(([^()]*)\)$/.exec(line.name);
    if (!line.foil && variation && SAYS_FOIL.test(variation[1])) {
      row = CKB.findCard(list, CKB.cardKey(line.edition + ": " + line.name, true));
      if (row) {
        return { row: row, foil: true };
      }
    }
    return null;
  };

  var QTY = /^\d+$/;
  var CONDITION = /^(NM|EX|VG|G)?$/;

  // readPurchaseInvoice answers { lines, unreadable }, or null on a page
  // with no invoice table. Each line is { card, name, edition, foil,
  // condition, qty, each, total, productID }, in the page's order: card is
  // the description as printed, and name and edition are card and "" until
  // purchaseRow finds where one ends and the other starts. foil is whether
  // card ends in " Foil". A graded card has no condition. A line that cannot
  // be read whole, or whose total is not its quantity times its price, is
  // counted in unreadable and not kept.
  CKB.readPurchaseInvoice = function (doc) {
    var table = doc.querySelector("table.orderContents");
    if (!table) {
      return null;
    }
    var lines = [];
    var unreadable = 0;
    var rows = table.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
      var td = cells(rows[i]);
      if (td.length !== 5 || !td[0].classList.contains("Description")) {
        continue;
      }
      var card = text(td[0]);
      var condition = text(td[1]);
      var qty = text(td[2]);
      var each = BAN.cents(text(td[3]));
      var total = BAN.cents(text(td[4]));
      if (!card || !CONDITION.test(condition) || !QTY.test(qty) || each === null || total === null ||
          total !== Number(qty) * each) {
        unreadable++;
        continue;
      }
      lines.push({
        card: card,
        name: card,
        edition: "",
        foil: / Foil$/.test(card),
        condition: condition,
        qty: Number(qty),
        each: each,
        total: total,
        productID: null,
      });
    }
    return { lines: lines, unreadable: unreadable };
  };

  // purchaseRow is the list's one row for a purchase line, { row, foil,
  // name, edition }, or null. Card names and editions both hold ": ", so
  // the card is split at each ": " in turn and found as a sell line is; the
  // one split that finds a row is the card, and none or more than one is
  // null.
  CKB.purchaseRow = function (line, list) {
    var found = null;
    for (var at = line.card.indexOf(": "); at > 0; at = line.card.indexOf(": ", at + 1)) {
      var name = line.card.slice(0, at);
      var edition = line.card.slice(at + 2);
      var foil = / Foil$/.test(edition);
      if (foil) {
        edition = edition.slice(0, -" Foil".length);
      }
      var hit = CKB.invoiceRow({ name: name, edition: edition, foil: foil }, list);
      if (hit) {
        if (found) {
          return null;
        }
        found = { row: hit.row, foil: hit.foil, name: name, edition: edition };
      }
    }
    return found;
  };
})(globalThis.CKB, globalThis.BAN);
