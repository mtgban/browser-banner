// Asks TCGplayer for its own order history, one request at a time and
// slowly, with the visitor's own session.
//
// The history's filter lives in the session, not the URL (SPECIFICATIONS.md
// section 1.1), so there are two requests: setFilter POSTs a range and a
// search the way the page's own dropdown does, and fetchPage GETs a page of
// whatever the session then holds.

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB, BAN) {
  "use strict";

  // PACE is the pause before each request after the first. It is the
  // siblings' figure; a long walk on the live site decides it for 0.1.0.
  TCGB.PACE = 1200;

  // The requests are core/net.js's, named for TCGplayer, which also says
  // when it wants a walk to slow down.
  var net = BAN.net("TCGplayer", { slowDown: true });
  TCGB.CHALLENGE = net.CHALLENGE;
  TCGB.BUSY = net.BUSY;
  TCGB.TIMED_OUT = net.TIMED_OUT;
  TCGB.after = net.after;

  var PATH = "/myaccount/orderhistory";

  // fetchPage reads page n of the list the session holds, parsed.
  TCGB.fetchPage = function (n) {
    return net.fetchPage(PATH + (n > 1 ? "?PageNumber=" + n : ""));
  };

  // setFilter puts a range and a search in the session, sending what the
  // page's SubmitOrderHistoryDateRange sends: the form's fields, the token
  // again as a header, and jQuery's X-Requested-With. clear is the page's
  // ClearSessionFilters, true for a new range and false for a search.
  TCGB.setFilter = function (token, range, search, clear) {
    var body = new URLSearchParams();
    body.set("__RequestVerificationToken", token);
    body.set("ClearSessionFilters", clear ? "true" : "False");
    body.set("SearchString", search);
    body.set("DateRange", range);
    return fetch(PATH, {
      method: "POST",
      credentials: "same-origin",
      signal: net.deadline(),
      headers: {
        __RequestVerificationToken: token,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
    })
      .then(net.check)
      .then(function () {})
      .catch(net.timedOut);
  };
})(globalThis.TCGB, globalThis.BAN);
