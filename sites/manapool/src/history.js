// Turns the buyer API's orders into the order history's lines
// (SPECIFICATIONS.md, section 3): one per order, its sellers' suborders
// folded into it.

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  function cents(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // orderRow reads one order into a line, or null when it is not whole: an
  // order number, a time, its four amounts in cents, and every seller's
  // name and item count. The date is the browser's own, as ManaPool's page
  // shows it.
  MPB.orderRow = function (o) {
    var placed = o && typeof o.created_at === "string" ? new Date(o.created_at) : null;
    var sellers = o && Array.isArray(o.order_seller_details) ? o.order_seller_details : null;
    if (!placed || isNaN(placed.getTime()) || !sellers || !/^\d+$/.test(o.order_number || "") ||
        !cents(o.subtotal_cents) || !cents(o.shipping_cents) || !cents(o.tax_cents) || !cents(o.total_cents)) {
      return null;
    }
    var items = 0;
    for (var i = 0; i < sellers.length; i++) {
      if (!sellers[i] || !cents(sellers[i].item_count) || typeof sellers[i].seller_username !== "string" || !sellers[i].seller_username) {
        return null;
      }
      items += sellers[i].item_count;
    }
    return {
      number: o.order_number,
      placed: placed,
      date: { year: placed.getFullYear(), month: placed.getMonth() + 1, day: placed.getDate() },
      dateText: placed.getFullYear() + "-" + pad(placed.getMonth() + 1) + "-" + pad(placed.getDate()) +
        " " + pad(placed.getHours()) + ":" + pad(placed.getMinutes()),
      sellers: sellers.map(function (s) {
        return s.seller_username;
      }).join("; "),
      packages: sellers.length,
      items: items,
      subtotal: o.subtotal_cents,
      shipping: o.shipping_cents,
      tax: o.tax_cents,
      total: o.total_cents,
    };
  };

  // [header, field of a line]
  var COLUMNS = [
    ["Order Number", function (r) { return r.number; }],
    ["Order Date", function (r) { return r.dateText; }],
    ["Sellers", function (r) { return r.sellers; }],
    ["Packages", function (r) { return r.packages; }],
    ["Items", function (r) { return r.items; }],
    ["Subtotal", function (r) { return BAN.decimal(r.subtotal); }],
    ["Shipping", function (r) { return BAN.decimal(r.shipping); }],
    ["Tax", function (r) { return BAN.decimal(r.tax); }],
    ["Total", function (r) { return BAN.decimal(r.total); }],
  ];

  // historyCSV writes the lines in the order given.
  MPB.historyCSV = function (rows) {
    var lines = [COLUMNS.map(function (c) { return c[0]; })];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(COLUMNS.map(function (c) { return c[1](r); }));
    }
    return BAN.csv(lines, "\n");
  };
})(globalThis.MPB, globalThis.BAN);
