// mtgban's handoff is core/handoff.js's, bound here with ManaPool's words.
// It sends Magic alone: ManaPool sells Magic alone.

globalThis.MPB = globalThis.MPB || {};

(function (MPB, BAN) {
  "use strict";

  MPB.REPLACED = "Another order was sent instead";
  MPB.CLOSED = "The upload page was closed; try again";
  MPB.BLOCKED = "The upload page was blocked; allow pop-ups here and try again";

  var sender = BAN.handoff({
    games: ["magic"],
    words: { blocked: MPB.BLOCKED, closed: MPB.CLOSED, replaced: MPB.REPLACED },
  });

  MPB.handoffURL = sender.handoffURL;

  // handOff opens mtgban's page straight from a click and gives it rows,
  // { csv, rows } or a promise of them; done(said) hears "" once they have
  // gone, null when there was nothing to send, or what went wrong.
  MPB.handOff = function (rows, done) {
    sender.handOff("magic", rows, done);
  };
})(globalThis.MPB, globalThis.BAN);
