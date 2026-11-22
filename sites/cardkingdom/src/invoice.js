// Reads a sell invoice, /myaccount/po_invoice/<id> (SPECIFICATIONS.md,
// section 17): its lines, grouped under their edition, " Foil" ending the
// heading of a foil one, each "2 NM @ $1.30" and its total.

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
})(globalThis.CKB, globalThis.BAN);
