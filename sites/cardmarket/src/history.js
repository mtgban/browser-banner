// Reads the visitor's purchase lists, /<language>/<Game>/Orders/Purchases/
// <Tab> (SPECIFICATIONS.md, section 9): one row per order, newest first,
// and writes them one line per order.

globalThis.MKM = globalThis.MKM || {};

(function (MKM, BAN) {
  "use strict";

  var ORDER = /\/Orders\/(\d+)$/;
  var DATE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?$/;

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  // readOrders answers { orders, unreadable } for one page of a list. Each
  // order is { id, seller, quantity, amount, currency, dateText, date }:
  // amount with a decimal point, in the currency the page wrote, and date
  // { year, month, day } read from dateText, "11.11.2026 22:12" as the page
  // prints it. A row that cannot be read whole is counted and not kept.
  MKM.readOrders = function (root) {
    var rows = root.querySelectorAll('#StatusTable .table-body > [data-url]');
    var orders = [];
    var unreadable = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = ORDER.exec(row.getAttribute("data-url") || "");
      var seller = text(row.querySelector(".seller-name > span:not(.icon):not(.text-nowrap)"));
      var quantity = text(row.querySelector(".col-smallNumber.d-lg-flex"));
      var price = MKM.readAmount(text(row.querySelector(".col-price")));
      // The day and the time are two spans with nothing between them.
      var parts = row.querySelectorAll(".col-datetime span");
      var dateText = Array.prototype.map.call(parts, text).join(" ");
      var date = DATE.exec(dateText);
      if (!id || !seller || !/^\d+$/.test(quantity) || !price || !date) {
        unreadable++;
        continue;
      }
      orders.push({
        id: id[1],
        seller: seller,
        quantity: quantity,
        amount: price.amount,
        currency: price.currency.toUpperCase(),
        dateText: dateText,
        date: { year: Number(date[3]), month: Number(date[2]), day: Number(date[1]) },
      });
    }
    return { orders: orders, unreadable: unreadable };
  };

  // [header, field of an order]
  var COLUMNS = [
    ["Order ID", "id"],
    ["Order Status", "status"],
    ["Date", "dateText"],
    ["Seller", "seller"],
    ["Quantity", "quantity"],
    ["Amount", "amount"],
    ["Currency", "currency"],
  ];

  // historyCSV writes one line per order, in the order given, each with the
  // list's status, as Card Kingdom's and TCGplayer's histories do.
  MKM.historyCSV = function (orders, status) {
    var lines = [COLUMNS.map(function (c) { return c[0]; })];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      lines.push(COLUMNS.map(function (c) {
        return c[1] === "status" ? status : o[c[1]];
      }));
    }
    return BAN.csv(lines, "\r\n");
  };
})(globalThis.MKM, globalThis.BAN);
