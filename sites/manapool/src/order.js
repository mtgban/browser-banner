// An order's cards (SPECIFICATIONS.md, section 6): the buyer API's order
// detail, every seller's suborder in it, made one line per card received.

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // ManaPool's finish and condition ids, in the words mtgban's upload reads.
  var FINISHES = { NF: "Nonfoil", FO: "Foil", EF: "Etched Foil" };
  var CONDITIONS = { NM: "NM", LP: "LP", MP: "MP", HP: "HP", DMG: "DMG" };

  function count(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n && n >= 0;
  }

  // card is one single's line, or null when any part of it does not read.
  function card(single, quantity, price) {
    if (!single || !UUID.test(single.scryfall_id || "") || !single.name || !single.set ||
        typeof single.number !== "string" || !FINISHES[single.finish_id] || !CONDITIONS[single.condition_id] ||
        !count(quantity) || !quantity || !count(price)) {
      return null;
    }
    return {
      scryfall: single.scryfall_id,
      name: single.name,
      set: single.set,
      number: single.number,
      finish: FINISHES[single.finish_id],
      condition: CONDITIONS[single.condition_id],
      language: single.language_id || "",
      quantity: quantity,
      price: price,
    };
  }

  // orderLines reads an order's detail into { lines, left }: one line per
  // card received, in the API's order, seller by seller, and how many copies
  // were left out and why (SPECIFICATIONS.md, section 6):
  //
  // - refunded: a refunded line's quantity comes off the item it names, and
  //   a seller whose last fulfillment says "refunded" sent nothing;
  // - away: a replacement shipped on its own is its own order's;
  // - unnamed: a replacement in the same package whose card ManaPool does
  //   not name;
  // - sealed, and unreadable lines.
  //
  // A replacement in the same package that names its card is that card.
  MPB.orderLines = function (order) {
    var left = { refunded: 0, away: 0, unnamed: 0, sealed: 0, unreadable: 0 };
    var lines = [];
    var sellers = order && Array.isArray(order.order_seller_details) ? order.order_seller_details : null;
    if (!sellers) {
      throw new Error("ManaPool answered with no order");
    }
    sellers.forEach(function (s) {
      var items = Array.isArray(s.items) ? s.items : [];
      var shipped = Array.isArray(s.fulfillments) && s.fulfillments.length ? s.fulfillments[s.fulfillments.length - 1] : null;
      var refundOf = {};
      (Array.isArray(s.refunded_items) ? s.refunded_items : []).forEach(function (r) {
        if (r && count(r.quantity)) {
          refundOf[r.order_item_id] = (refundOf[r.order_item_id] || 0) + r.quantity;
        }
      });
      items.forEach(function (it) {
        var product = it && it.product;
        if (!it || !count(it.quantity) || !count(it.price_cents)) {
          left.unreadable++;
          return;
        }
        if (shipped && shipped.status === "refunded") {
          left.refunded += it.quantity;
          return;
        }
        var refunded = Math.min(it.quantity, refundOf[it.order_item_id] || 0);
        left.refunded += refunded;
        var q = it.quantity - refunded;
        if (!q) {
          return;
        }
        if (product && product.product_type !== "mtg_single" && product.sealed) {
          left.sealed += q;
          return;
        }
        var swap = it.replacement;
        var swapped = swap && count(swap.quantity) ? Math.min(q, swap.quantity) : 0;
        var other = null;
        if (swapped && !swap.same_package) {
          left.away += swapped;
          q -= swapped;
        } else if (swapped && !swap.product) {
          left.unnamed += swapped;
          q -= swapped;
        } else if (swapped) {
          other = card(swap.product.single, swapped, it.price_cents);
          q -= swapped;
        }
        var own = q ? card(product && product.single, q, it.price_cents) : null;
        if ((q && !own) || (swapped && swap.same_package && swap.product && !other)) {
          left.unreadable++;
          return;
        }
        if (own) {
          lines.push(own);
        }
        if (other) {
          lines.push(other);
        }
      });
    });
    return { lines: lines, left: left };
  };

  // orderLinked is the id of the order a package's page says it is part of,
  // in the link under its heading, or null.
  MPB.orderLinked = function (doc) {
    var heading = doc.querySelector("h1");
    var ids = [];
    Array.prototype.forEach.call(heading ? heading.parentElement.querySelectorAll("a[href]") : [], function (a) {
      var m = /\/settings\/orders\/([0-9a-f-]{36})\/?$/.exec(a.getAttribute("href"));
      if (m && UUID.test(m[1]) && ids.indexOf(m[1]) < 0) {
        ids.push(m[1]);
      }
    });
    return ids.length === 1 ? ids[0] : null;
  };

  // packageNumber is the number in a package's heading, as the API writes
  // it in the suborder's order_number, or null.
  MPB.packageNumber = function (doc) {
    var m = /#(\d+-\d+)\s*$/.exec((doc.querySelector("h1") || {}).textContent || "");
    return m ? m[1] : null;
  };

  // packageOf is an order with the one seller whose suborder has the
  // package's id or its number.
  MPB.packageOf = function (order, id, number) {
    var sellers = order && Array.isArray(order.order_seller_details) ? order.order_seller_details : [];
    var own = sellers.filter(function (s) {
      return s && (s.id === id || (number !== null && s.order_number === number));
    });
    if (own.length !== 1) {
      throw new Error("ManaPool's order does not list this package");
    }
    return { order_number: own[0].order_number, order_seller_details: own };
  };

  // [header, field of a line], named so mtgban's upload reads each: the id,
  // name, set, collector number, finish, condition, quantity and price.
  // Nothing else is headed with "number", which it would read as the
  // collector number.
  var COLUMNS = [
    ["Scryfall ID", function (l) { return l.scryfall; }],
    ["Name", function (l) { return l.name; }],
    ["Set", function (l) { return l.set; }],
    ["Number", function (l) { return l.number; }],
    ["Finish", function (l) { return l.finish; }],
    ["Condition", function (l) { return l.condition; }],
    ["Language", function (l) { return l.language; }],
    ["Quantity", function (l) { return l.quantity; }],
    ["Price", function (l) { return BAN.decimal(l.price); }],
  ];

  MPB.orderCSV = function (lines) {
    var rows = [COLUMNS.map(function (c) { return c[0]; })];
    lines.forEach(function (l) {
      rows.push(COLUMNS.map(function (c) { return c[1](l); }));
    });
    return BAN.csv(rows, "\n");
  };

  // getOrder reads one order's detail by its id.
  MPB.getOrder = function (id) {
    return MPB.getJSON("/api/v1/buyer/orders/" + id).then(function (body) {
      return body && body.order;
    });
  };
})(globalThis.MPB, globalThis.BAN);
