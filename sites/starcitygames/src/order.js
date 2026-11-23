// An order's cards (SPECIFICATIONS.md, section 4): one line per card kept,
// read from its SKU.

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB, BAN) {
  "use strict";

  // SGL-MTG-NEM-30-ENF2: a single, its game, its set, its number, then its
  // language, finish and grade together.
  var SKU = /^SGL-([A-Z0-9]+)-([A-Z0-9]+)-(.+)-([A-Z]{2})([A-Z])\d$/;
  // A foil's letter is F, or A where a set has more than one kind of foil.
  var FINISHES = { N: "Nonfoil", F: "Foil", A: "Foil" };
  // Star City Games' grades, in the words mtgban's upload reads.
  var CONDITIONS = { "Near Mint": "NM", Played: "SP", "Heavily Played": "HP" };
  // The promos whose SKU names their own set and number, PRE_SNC_230, and
  // what mtgban calls them.
  var PROMOS = { PRE: "Prerelease ", PP: "Promo Pack ", SECRET: "", JDG: "", BUN: "" };

  // printing is the set and number a SKU's card is found under: the set by
  // the name the item's picture carries, or the SKU's code where it carries
  // none.
  function printing(code, number, item) {
    if (code === "PRM") {
      var parts = /^([A-Z]+)_([A-Z0-9]{3,4})_([^_]+)$/.exec(number);
      var word = parts && PROMOS.hasOwnProperty(parts[1]) ? PROMOS[parts[1]] : null;
      return word === null ? { set: "Promo", number: number } : { set: parts[2], number: word + parts[3] };
    }
    var alt = String((item.image && item.image.alt) || "").split(/\\n|\n/);
    return { set: alt.length > 1 && alt[1].trim() ? alt[1].trim() : code, number: number };
  }

  function conditionOf(item) {
    var options = Array.isArray(item.options) ? item.options : [];
    for (var i = 0; i < options.length; i++) {
      if (options[i] && options[i].name === "Condition") {
        return CONDITIONS[options[i].value] || "";
      }
    }
    return "";
  }

  // printed is what the store's script has written on an order's page as
  // paid for a copy of each item, in cents, by the item's own id.
  SCGB.printed = function (doc) {
    var prices = Object.create(null);
    Array.prototype.forEach.call(doc.querySelectorAll(".account-listItem[data-order_product_id]"), function (entry) {
      var sum = entry.querySelector(".paid-price .product-sum");
      var paid = sum ? BAN.cents(sum.textContent.replace(/^\s*\d+ x /, "")) : null;
      if (paid !== null) {
        prices[entry.getAttribute("data-order_product_id")] = paid;
      }
    });
    return prices;
  };

  // orderLines reads an order into { lines, left, unpriced }: one line per
  // Magic card kept, in the order's own order; how many copies were left
  // out and why; and how many lines have no price. price is each copy's,
  // as printed has it, or else with the discount taken off where that is
  // one whole percent; without either it is not known.
  SCGB.orderLines = function (order, printed) {
    var left = { refunded: 0, games: 0, sealed: 0, unreadable: 0 };
    var lines = [];
    var t = SCGB.totals(order);
    var percent = t.why ? null : t.percent;
    SCGB.items(order).forEach(function (item) {
      var c = SCGB.copies(item);
      if (!c) {
        left.unreadable++;
        return;
      }
      var q = SCGB.keptNothing(order) ? 0 : c.quantity - c.refunded;
      left.refunded += c.quantity - q;
      if (!q) {
        return;
      }
      var sku = SKU.exec(item.sku || "");
      if (!sku && typeof item.sku === "string" && item.sku && item.sku.indexOf("SGL-") !== 0) {
        left.sealed += q;
        return;
      }
      if (sku && sku[1] !== "MTG") {
        left.games += q;
        return;
      }
      var name = String(item.name || "").replace(/ \[SGL-[^\]]*\]$/, "").trim();
      var condition = conditionOf(item);
      var price = SCGB.cents(item.price);
      if (!sku || !name || !FINISHES[sku[5]] || !condition || price === null) {
        left.unreadable++;
        return;
      }
      var paid = (printed || {})[item.order_product_id];
      var at = printing(sku[2], sku[3], item);
      lines.push({
        sku: item.sku,
        name: name,
        set: at.set,
        number: at.number,
        finish: FINISHES[sku[5]],
        condition: condition,
        language: sku[4],
        quantity: q,
        price: paid !== undefined ? paid : percent === null ? null : Math.round((price * (100 - percent)) / 100),
      });
    });
    return {
      lines: lines,
      left: left,
      unpriced: lines.filter(function (l) {
        return l.price === null;
      }).length,
    };
  };

  // [header, field of a line], named so mtgban's upload reads each. Nothing
  // else is headed with "number", which it would read as the collector
  // number.
  var COLUMNS = [
    ["Name", function (l) { return l.name; }],
    ["Set", function (l) { return l.set; }],
    ["Number", function (l) { return l.number; }],
    ["Finish", function (l) { return l.finish; }],
    ["Condition", function (l) { return l.condition; }],
    ["Language", function (l) { return l.language; }],
    ["Quantity", function (l) { return l.quantity; }],
    ["Price", function (l) { return l.price === null ? "" : BAN.decimal(l.price); }],
    ["SKU", function (l) { return l.sku; }],
  ];

  SCGB.orderCSV = function (lines) {
    var rows = [COLUMNS.map(function (c) { return c[0]; })];
    lines.forEach(function (l) {
      rows.push(COLUMNS.map(function (c) { return c[1](l); }));
    });
    return BAN.csv(rows, "\n");
  };
})(globalThis.SCGB, globalThis.BAN);
