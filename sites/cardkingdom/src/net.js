// Card Kingdom's requests are core/net.js's, named for it.

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  // PACE is the pause before each page after the first. It is Cardmarket's
  // figure, where three requests inside a second drew a challenge.
  CKB.PACE = 1200;

  var net = BAN.net("Card Kingdom");
  CKB.CHALLENGE = net.CHALLENGE;
  CKB.TIMED_OUT = net.TIMED_OUT;
  CKB.deadline = net.deadline;
  CKB.challenged = net.challenged;
  CKB.after = net.after;
  CKB.fetchPage = net.fetchPage;
})(globalThis.CKB, globalThis.BAN);
