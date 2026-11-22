// mtgban's handoff is core/handoff.js's, bound here with TCGplayer's words.
// It sends Magic alone, until a saved page has shown how TCGplayer names
// another game's products.

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB, BAN) {
  "use strict";

  TCGB.REPLACED = "Another order was sent instead";
  TCGB.CLOSED = "The upload page was closed; try again";

  var sender = BAN.handoff({
    games: ["magic"],
    words: {
      blocked: "The upload page was blocked; allow pop-ups here and try again",
      closed: TCGB.CLOSED,
      replaced: TCGB.REPLACED,
    },
  });

  TCGB.handoffURL = sender.handoffURL;
  TCGB.isBanHost = BAN.isBanHost;

  // handOff gives mtgban's page csv, rows long, straight from a click;
  // done(error) hears "" when the rows have gone, or what went wrong.
  TCGB.handOff = function (game, csv, rows, done) {
    sender.handOff(game, { csv: csv, rows: rows }, done);
  };
})(globalThis.TCGB, globalThis.BAN);
