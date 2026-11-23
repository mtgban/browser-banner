// What an order cost (SPECIFICATIONS.md, section 3). Star City Games prints
// an order's total after store credit, and leaves refunds out of it, so the
// cost is worked out from the order's own lines.

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB) {
  "use strict";

  // cents reads a price the page carries, { value: 71.24 }, or null.
  SCGB.cents = function (price) {
    var value = price && price.value;
    if (typeof value !== "number" || !isFinite(value)) {
      return null;
    }
    var c = Math.round(value * 100);
    return Math.abs(value * 100 - c) < 1e-6 ? c : null;
  };

  // copies is an item's quantity and how many of it were refunded, or null.
  SCGB.copies = function (item) {
    var q = item && item.quantity;
    var r = item && item.refunded_qty;
    if (typeof q !== "number" || typeof r !== "number" || Math.floor(q) !== q || Math.floor(r) !== r || q < 1 || r < 0 || r > q) {
      return null;
    }
    return { quantity: q, refunded: item.refunded === true ? q : r };
  };

  // The order statuses in which nothing was kept, whatever its items say:
  // Refunded, Cancelled and Declined.
  var NOTHING = { 4: true, 5: true, 6: true };

  SCGB.keptNothing = function (order) {
    return NOTHING[order.status] === true;
  };

  // items is an order's items less the line Star City Games adds, at no
  // price, to ship a buyer's cards back: it is no card and no product.
  SCGB.items = function (order) {
    return order.items.filter(function (item) {
      return !item || item.sku !== "BUYER-RETURN";
    });
  };

  // The lines of an order's totals, by label. An order with any other is
  // not added up: whether it charges or pays is not known.
  function kindOf(label) {
    if (/^Coupon Code \(.*\)$/.test(label) || label === "Discount") {
      return "discount";
    }
    return { Subtotal: "subtotal", Shipping: "shipping", Tax: "tax", "Store Credit": "credit", "Grand total": "grand" }[label] || "";
  }

  // off is what a whole percent takes off lines, their amounts in cents,
  // each rounded on its own.
  function off(lines, percent) {
    return lines.reduce(function (n, line) {
      return n + Math.round((line * percent) / 100);
    }, 0);
  }

  // percentOf is the whole percent a discount is of an order's lines, or
  // null when it is none, or could be more than one.
  function percentOf(discount, lines) {
    var found = null;
    for (var p = 1; p <= 100; p++) {
      if (off(lines, p) === discount) {
        if (found !== null) {
          return null;
        }
        found = p;
      }
    }
    return found;
  }

  // totals reads an order's totals, { subtotal, discount, shipping, tax,
  // paid, adds, percent }, in cents: discount what it takes off, paid what
  // the buyer gave, store credit included, adds whether they come to each
  // other and to the items, and percent the discount's, null where it is
  // not one whole percent of every line. Or { why }: what does not read.
  SCGB.totals = function (order) {
    var sums = { subtotal: 0, discount: 0, shipping: 0, tax: 0, credit: 0, grand: 0 };
    var seen = Object.create(null);
    var rows = Array.isArray(order.total_rows) ? order.total_rows : [];
    for (var i = 0; i < rows.length; i++) {
      var label = String((rows[i] && rows[i].label) || "");
      var kind = kindOf(label);
      var value = SCGB.cents(rows[i] && rows[i].value);
      if (!kind || value === null) {
        return { why: 'a "' + label + '" line' };
      }
      sums[kind] += value;
      seen[kind] = true;
    }
    if (!seen.subtotal || !seen.grand || sums.discount > 0) {
      return { why: "totals that do not read" };
    }
    var lines = [];
    var listed = 0;
    for (var j = 0; j < order.items.length; j++) {
      var c = SCGB.copies(order.items[j]);
      var price = SCGB.cents(order.items[j].price);
      if (!c || price === null) {
        return { why: "an unreadable item" };
      }
      lines.push(c.quantity * price);
      listed += c.quantity * price;
    }
    var discount = 0 - sums.discount;
    var adds = listed === sums.subtotal &&
      sums.subtotal - discount + sums.shipping + sums.tax + sums.credit === sums.grand;
    return {
      subtotal: sums.subtotal,
      discount: discount,
      shipping: sums.shipping,
      tax: sums.tax,
      paid: sums.grand - sums.credit,
      adds: adds,
      percent: !discount ? 0 : adds ? percentOf(discount, lines) : null,
    };
  };

  // cost is what an order, its items' copies readable, came to for the copies
  // kept, { subtotal, discount, shipping, tax, total }, or { why }. With
  // nothing refunded that is its own lines and what was paid. An order none
  // of which was kept came to nothing, shipping included. A refund takes its
  // share of a discount with it, known only for a whole percent; its share
  // of the tax is not.
  SCGB.cost = function (order) {
    var kept = [];
    var keptCents = 0;
    var refunded = 0;
    SCGB.items(order).forEach(function (item) {
      var c = SCGB.copies(item);
      refunded += c.refunded;
      if (c.quantity > c.refunded) {
        kept.push((c.quantity - c.refunded) * SCGB.cents(item.price));
        keptCents += kept[kept.length - 1];
      }
    });
    if (SCGB.keptNothing(order) || (refunded && !kept.length)) {
      return { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 };
    }
    var t = SCGB.totals(order);
    if (t.why) {
      return t;
    }
    if (!refunded) {
      return { subtotal: t.subtotal, discount: t.discount, shipping: t.shipping, tax: t.tax, total: t.paid };
    }
    if (!t.adds) {
      return { why: "a refund on lines that do not add up" };
    }
    if (t.percent === null) {
      return { why: "a refund under a discount that is not a whole percent" };
    }
    if (t.tax) {
      return { why: "a refund on a taxed order" };
    }
    var discount = off(kept, t.percent);
    return {
      subtotal: keptCents,
      discount: discount,
      shipping: t.shipping,
      tax: t.tax,
      total: keptCents - discount + t.shipping,
    };
  };
})(globalThis.SCGB);
