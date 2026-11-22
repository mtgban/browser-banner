// mtgban's handoff is core/handoff.js's, bound here with Cardmarket's words.
// It sends every game BAN prices: what Cardmarket sells beyond them gets
// the panel and the file, and no send.

globalThis.MKM = globalThis.MKM || {};

(function (MKM, BAN) {
  "use strict";

  MKM.BLOCKED = "The upload page was blocked; use the CSV";
  MKM.CLOSED = "The upload page was closed; use the CSV";
  MKM.REPLACED = "Another send took over";

  var sender = BAN.handoff({
    games: BAN.GAMES,
    words: { blocked: MKM.BLOCKED, closed: MKM.CLOSED, replaced: MKM.REPLACED },
  });

  MKM.handoffURL = sender.handoffURL;
  MKM.isBanHost = BAN.isBanHost;
  MKM.handOff = sender.handOff;
})(globalThis.MKM, globalThis.BAN);
