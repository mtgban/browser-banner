// Reads Star City Games' account pages (SPECIFICATIONS.md, section 2): the
// order list, and the order each order's page carries as JSON.

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB, BAN) {
  "use strict";

  // PACE is the pause before each request after the first.
  SCGB.PACE = 1200;

  var net = BAN.net("Star City Games");
  SCGB.CHALLENGE = net.CHALLENGE;
  SCGB.fetchPage = net.fetchPage;
  SCGB.after = net.after;
  SCGB.NO_LIST = "Star City Games answered with no order list; sign in and try again";
  SCGB.NO_ORDER = "Star City Games answered with no order; sign in and try again";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DATE = /^([A-Z][a-z]{2}) (\d{1,2})(?:st|nd|rd|th) (\d{4})$/;

  // date reads "Nov 21st 2026" as {year, month, day}, or null.
  SCGB.date = function (text) {
    var m = DATE.exec(String(text).replace(/\s+/g, " ").trim());
    var month = m ? MONTHS.indexOf(m[1]) + 1 : 0;
    if (!month) {
      return null;
    }
    var date = { year: Number(m[3]), month: month, day: Number(m[2]) };
    return date.day >= 1 && date.day <= BAN.daysIn(date.year, month) ? date : null;
  };

  // readList reads a page of the order list, { orders: [{ id, date }],
  // unreadable }, and refuses a page with no list on it.
  SCGB.readList = function (doc) {
    if (!doc.querySelector(".orders-list")) {
      throw new Error(SCGB.NO_LIST);
    }
    var read = { orders: [], unreadable: 0 };
    Array.prototype.forEach.call(doc.querySelectorAll(".orders-list > .account-listItem"), function (entry) {
      var link = entry.querySelector(".order-title a");
      var placed = entry.querySelector(".order-date p");
      var id = /[?&]order_id=(\d+)(?:&|$)/.exec((link && link.getAttribute("href")) || "");
      var date = placed && SCGB.date(placed.textContent);
      if (!id || !date) {
        read.unreadable++;
        return;
      }
      read.orders.push({ id: id[1], date: date });
    });
    return read;
  };

  // nextPage is the address of the list's next page, or "" on the last,
  // which has no next link.
  SCGB.nextPage = function (doc, base) {
    var link = doc.querySelector(".pagination-c-item--next a[href]");
    if (!link) {
      return "";
    }
    var url = new URL(link.getAttribute("href"), base);
    return url.origin === new URL(base).origin ? url.href : "";
  };

  // firstPage is the list's first page when href is a later one, else "".
  SCGB.firstPage = function (href) {
    var url = new URL(href);
    var page = url.searchParams.get("page");
    if (!page || page === "1") {
      return "";
    }
    url.searchParams.set("page", "1");
    return url.href;
  };

  SCGB.orderURL = function (id) {
    return "/account.php?action=view_order&order_id=" + id;
  };

  // The order's page boots the store's own script with everything it draws,
  // as a JSON string inside a JavaScript one.
  var BOOT = /stencilBootstrap\("account_order",\s*("(?:[^"\\]|\\.)*")/;

  // orderIn answers with the order a page carries, and refuses a page with
  // none, or with another order than id.
  SCGB.orderIn = function (doc, id) {
    var scripts = doc.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var boot = BOOT.exec(scripts[i].textContent || "");
      if (!boot) {
        continue;
      }
      var order = null;
      try {
        order = JSON.parse(JSON.parse(boot[1])).order;
      } catch (err) {
        break;
      }
      if (order && String(order.id) === String(id)) {
        return order;
      }
    }
    throw new Error(SCGB.NO_ORDER);
  };
})(globalThis.SCGB, globalThis.BAN);
