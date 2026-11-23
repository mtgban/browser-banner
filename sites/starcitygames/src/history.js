// The order history's lines (SPECIFICATIONS.md, section 3), one per order.

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB, BAN) {
  "use strict";

  // orderRow reads one order into a line, date as the list gave it, or null
  // when it has no status or no items. cost is SCGB.cost's, amounts or why
  // there are none.
  SCGB.orderRow = function (order, date) {
    if (!order || typeof order.status_text !== "string" || !order.status_text || !Array.isArray(order.items) || !order.items.length) {
      return null;
    }
    var kept = 0;
    var refunded = 0;
    var items = SCGB.items(order);
    for (var i = 0; i < items.length; i++) {
      var c = SCGB.copies(items[i]);
      if (!c) {
        return null;
      }
      var gone = SCGB.keptNothing(order) ? c.quantity : c.refunded;
      kept += c.quantity - gone;
      refunded += gone;
    }
    return {
      number: String(order.id),
      date: date,
      status: order.status_text,
      items: kept,
      refunded: refunded,
      cost: SCGB.cost(order),
    };
  };

  function amount(name) {
    return function (r) {
      return r.cost.why ? "" : BAN.decimal(r.cost[name]);
    };
  }

  // [header, field of a line]
  var COLUMNS = [
    ["Order Number", function (r) { return r.number; }],
    ["Order Date", function (r) { return BAN.ymd(r.date); }],
    ["Status", function (r) { return r.status; }],
    ["Items", function (r) { return r.items; }],
    ["Refunded", function (r) { return r.refunded; }],
    ["Subtotal", amount("subtotal")],
    ["Discount", amount("discount")],
    ["Shipping", amount("shipping")],
    ["Tax", amount("tax")],
    ["Total", amount("total")],
  ];

  // historyCSV writes the lines in the order given.
  SCGB.historyCSV = function (rows) {
    var lines = [COLUMNS.map(function (c) { return c[0]; })];
    rows.forEach(function (r) {
      lines.push(COLUMNS.map(function (c) { return c[1](r); }));
    });
    return BAN.csv(lines, "\n");
  };
})(globalThis.SCGB, globalThis.BAN);
