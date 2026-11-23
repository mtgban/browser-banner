// Asks ManaPool's buyer API for the visitor's own orders (SPECIFICATIONS.md,
// section 2): the requests a token would make, made with the session the
// page already has, one at a time and slowly.

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  // PACE is the pause before each request after the first.
  MPB.PACE = 1200;
  // LIMIT is the most orders the API answers with at once.
  MPB.LIMIT = 100;

  var net = BAN.net("ManaPool");
  MPB.CHALLENGE = net.CHALLENGE;
  MPB.TIMED_OUT = net.TIMED_OUT;
  MPB.SIGNED_OUT = "Sign in to ManaPool to read your orders";

  var ORDERS = "/api/v1/buyer/orders";

  // getJSON reads one answer of the API. A 401 is a visitor ManaPool has
  // not signed in, said as what to do.
  MPB.getJSON = function (path) {
    return fetch(path, {
      credentials: "same-origin",
      signal: net.deadline(),
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (response.status === 401) {
          throw new Error(MPB.SIGNED_OUT);
        }
        return net.check(response);
      })
      .then(function (response) {
        return response.json();
      })
      .catch(net.timedOut);
  };

  // listOrders answers with every order placed at or after since, an ISO
  // time or "" for all of them, oldest first as the API gives them: one
  // request per LIMIT orders, PACE apart, until one comes back short.
  // going(n) is told before request n and answers false to stop, which
  // ends the walk with null.
  MPB.listOrders = function (since, going) {
    var orders = [];

    function page(n) {
      if (!going(n)) {
        return Promise.resolve(null);
      }
      var query = "?limit=" + MPB.LIMIT + "&offset=" + (n - 1) * MPB.LIMIT + (since ? "&since=" + encodeURIComponent(since) : "");
      return MPB.getJSON(ORDERS + query).then(function (body) {
        var got = body && Array.isArray(body.orders) ? body.orders : null;
        if (!got) {
          throw new Error("ManaPool answered with no orders list");
        }
        orders = orders.concat(got);
        if (got.length < MPB.LIMIT) {
          return orders;
        }
        return net.after(MPB.PACE).then(function () {
          return page(n + 1);
        });
      });
    }

    return page(1);
  };
})(globalThis.MPB, globalThis.BAN);
