// mtgban's handoff is core/handoff.js's, bound here with Card Kingdom's
// words. It sends Magic alone: the carts are read against CK's Magic price
// list.

globalThis.CKB = globalThis.CKB || {};

(function (CKB, BAN) {
  "use strict";

  CKB.REPLACED = "The cart was sent again instead";
  CKB.CLOSED = "The upload page was closed; try again";

  var sender = BAN.handoff({
    games: ["magic"],
    words: {
      blocked: "The upload page was blocked; allow pop-ups here and try again",
      closed: CKB.CLOSED,
      replaced: CKB.REPLACED,
    },
  });

  CKB.handoffURL = sender.handoffURL;
  CKB.isBanHost = BAN.isBanHost;

  // handOff gives mtgban's page csv, rows long, straight from a click;
  // done(error) hears "" when the rows have gone, or what went wrong.
  CKB.handOff = function (game, csv, rows, done) {
    sender.handOff(game, { csv: csv, rows: rows }, done);
  };
})(globalThis.CKB, globalThis.BAN);
