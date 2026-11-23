// mtgban's handoff is core/handoff.js's, bound here with Star City Games'
// words. It sends Magic alone, until a saved order has shown another game's
// cards.

globalThis.SCGB = globalThis.SCGB || {};

(function (SCGB, BAN) {
  "use strict";

  SCGB.REPLACED = "Another order was sent instead";
  SCGB.CLOSED = "The upload page was closed; try again";
  SCGB.BLOCKED = "The upload page was blocked; allow pop-ups here and try again";

  var sender = BAN.handoff({
    games: ["magic"],
    words: { blocked: SCGB.BLOCKED, closed: SCGB.CLOSED, replaced: SCGB.REPLACED },
  });

  // handOff opens mtgban's page straight from a click and gives it rows,
  // { csv, rows }; done(said) hears "" once they have gone, or what went
  // wrong.
  SCGB.handOff = function (rows, done) {
    sender.handOff("magic", rows, done);
  };
})(globalThis.SCGB, globalThis.BAN);
