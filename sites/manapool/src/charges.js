// An order's charges (SPECIFICATIONS.md, section 3.1): the fees and the
// refunds, which ManaPool's order page knows and its buyer API does not, read
// from the data that page loads.

globalThis.MPB = globalThis.MPB || {};

(function (MPB) {
  "use strict";

  // Extra Mana is ManaPool's credit, ten to the cent.
  var MANA_PER_CENT = 10;

  function cents(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n && n >= 0;
  }

  // hydrate rebuilds the value at index i of a page's flattened data, as
  // SvelteKit writes it: every value in one array, each reference an index
  // into it, a negative index one of its constants, and a Map, a Date or a
  // promise an array headed by its name. A promise is not followed: what it
  // stands for comes in a later line, and nothing read here is one.
  function hydrate(values) {
    var made = {};
    var CONSTANTS = { "-1": undefined, "-2": undefined, "-3": NaN, "-4": Infinity, "-5": -Infinity, "-6": -0 };

    function at(i) {
      if (typeof i !== "number" || Math.floor(i) !== i) {
        throw new Error("not a reference");
      }
      if (i < 0) {
        return CONSTANTS[i];
      }
      if (Object.prototype.hasOwnProperty.call(made, i)) {
        return made[i];
      }
      if (i >= values.length) {
        throw new Error("a reference past the data");
      }
      var v = values[i];
      if (v === null || typeof v !== "object") {
        return (made[i] = v);
      }
      if (Array.isArray(v) && typeof v[0] === "string") {
        if (v[0] === "Date") {
          return (made[i] = v[1]);
        }
        if (v[0] === "Map") {
          var map = (made[i] = {});
          for (var k = 1; k + 1 < v.length; k += 2) {
            map[String(at(v[k]))] = at(v[k + 1]);
          }
          return map;
        }
        if (v[0] === "Promise") {
          return (made[i] = null);
        }
        throw new Error("an unknown kind of value, " + v[0]);
      }
      if (Array.isArray(v)) {
        var list = (made[i] = []);
        for (var j = 0; j < v.length; j++) {
          list.push(at(v[j]));
        }
        return list;
      }
      var obj = (made[i] = {});
      for (var key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) {
          obj[key] = at(v[key]);
        }
      }
      return obj;
    }

    return at;
  }

  // pageOf finds the order page's own data in a body of its data: the
  // first line's node whose top level has the order and its reports. A body
  // that sends the visitor to sign in answers "signed out".
  function pageOf(text) {
    var first;
    try {
      first = JSON.parse(String(text).split("\n")[0]);
    } catch (e) {
      return null;
    }
    if (first && first.type === "redirect" && /^\/auth\b/.test(String(first.location || ""))) {
      return "signed out";
    }
    var nodes = first && first.type === "data" && Array.isArray(first.nodes) ? first.nodes : [];
    for (var i = 0; i < nodes.length; i++) {
      var data = nodes[i] && Array.isArray(nodes[i].data) ? nodes[i].data : null;
      var top = data && data[0];
      if (top && typeof top === "object" && !Array.isArray(top) && "order" in top && "orderReportsBySellerOrderId" in top) {
        try {
          var at = hydrate(data);
          return {
            order: at(top.order),
            reports: at(top.orderReportsBySellerOrderId),
            gathered: "gatheredOrderReports" in top ? at(top.gatheredOrderReports) : [],
          };
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  // chargesOf reads one order's charges from a body of its page's data into
  // { fees, total, refunded, unstated }, cents, or null when it does not
  // read whole, or "signed out":
  //
  // - fees: the singles fee and the Gather fee;
  // - total: subtotal, shipping, tax and fees, what the card and Extra Mana
  //   paid between them;
  // - refunded: every remediation's refund, in cash and in Extra Mana, no
  //   more than total; null when a remediation states no amount and opens
  //   no replacement order, or reports of a Gathered order are there to read;
  // - unstated: that it is null for that reason.
  MPB.chargesOf = function (text) {
    var page = pageOf(text);
    if (page === null || page === "signed out") {
      return page;
    }
    var o = page.order;
    if (!o || !cents(o.subtotalCents) || !cents(o.shippingCents) || !cents(o.taxCents) ||
        !cents(o.buyerFeeCents) || !cents(o.gatheredFeeCents) ||
        !page.reports || typeof page.reports !== "object" || Array.isArray(page.reports) ||
        !Array.isArray(page.gathered)) {
      return null;
    }
    var fees = o.buyerFeeCents + o.gatheredFeeCents;
    var total = o.subtotalCents + o.shippingCents + o.taxCents + fees;
    var cash = 0;
    var mana = 0;
    var unstated = page.gathered.length > 0;
    for (var seller in page.reports) {
      var reports = page.reports[seller];
      if (!Array.isArray(reports)) {
        return null;
      }
      for (var r = 0; r < reports.length; r++) {
        var rems = reports[r] && reports[r].remediations;
        if (!Array.isArray(rems)) {
          return null;
        }
        for (var m = 0; m < rems.length; m++) {
          var rem = rems[m];
          var inCash = rem ? rem.refundCents : undefined;
          var inMana = rem ? rem.refundExtraMana : undefined;
          if ((inCash != null && !cents(inCash)) || (inMana != null && !cents(inMana))) {
            return null;
          }
          if (inCash == null && inMana == null) {
            if (!rem || !rem.remedialOrderSellerDetailsId) {
              unstated = true;
            }
            continue;
          }
          cash += inCash || 0;
          mana += inMana || 0;
        }
      }
    }
    var refunded = cash + Math.round(mana / MANA_PER_CENT);
    return {
      fees: fees,
      total: total,
      refunded: unstated ? null : Math.min(refunded, total),
      unstated: unstated,
    };
  };
})(globalThis.MPB);
