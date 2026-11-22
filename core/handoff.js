// Hands a store's rows to mtgban's uploader.
//
// The upload needs mtgban's session, whose cookie is not sent on a request
// made from a store's page. So nothing is posted from here: mtgban serves
// /upload/handoff, which opens as an ordinary navigation, says when it is
// listening, takes the rows from the window that opened it, and uploads
// them itself.
//
// A factory and nothing else: each store makes its own sender, with the
// games it may send and its own words, and binds it onto its own global.

globalThis.BAN = globalThis.BAN || {};

(function (BAN) {
  "use strict";

  // What the two halves of the handoff say to each other.
  var READY = "mtgban-handoff-ready";
  var ROWS = "mtgban-handoff-rows";

  // Each game is served by its own deployment. Magic is the default one and
  // answers at the bare domain: magic.mtgban.com redirects there, which
  // changes the origin on the way, so it is named as it ends up.
  //
  // All nine BAN prices are here. What a store can send is the overlap of
  // this list and the games it reads, which the store decides.
  var HOSTS = {
    magic: "mtgban.com",
    pokemon: "pokemon.mtgban.com",
    yugioh: "yugioh.mtgban.com",
    lorcana: "lorcana.mtgban.com",
    onepiece: "onepiece.mtgban.com",
    fleshandblood: "fleshandblood.mtgban.com",
    riftbound: "riftbound.mtgban.com",
    gundam: "gundam.mtgban.com",
    palworld: "palworld.mtgban.com",
  };

  // GAMES is every game BAN prices.
  BAN.GAMES = Object.keys(HOSTS);

  // isBanHost says whether an origin is one of mtgban's. The window that
  // answers may have been redirected to another of them, so what pins the
  // conversation to it is the source check beside this one.
  BAN.isBanHost = function (origin) {
    var parsed;
    try {
      parsed = new URL(origin);
    } catch (err) {
      return false;
    }
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "mtgban.com" || parsed.hostname.slice(-11) === ".mtgban.com")
    );
  };

  // handoff makes one store's sender. options.games is the games the store
  // may send; options.words is what its done hears: blocked, closed (the tab
  // went before it took the rows) and replaced (a later send took over).
  BAN.handoff = function (options) {
    var games = options.games;
    var words = options.words;

    // The handoff still waiting to hear from its tab: {listener, onFocus,
    // opened, finish}. The page it opens has no deadline, so one at a time is
    // what keeps a tab that never answers from leaving its listener behind
    // for the life of the page.
    var awaiting = null;

    function handoffURL(game) {
      return games.indexOf(game) >= 0 && HOSTS[game] ? "https://" + HOSTS[game] + "/upload/handoff" : "";
    }

    // stopWaiting takes the waiting handoff's listeners down and answers
    // with it.
    function stopWaiting() {
      var was = awaiting;
      awaiting = null;
      window.removeEventListener("message", was.listener);
      window.removeEventListener("focus", was.onFocus);
      return was;
    }

    // handOff opens the game's handoff page and gives it the rows, {csv,
    // rows}, once the page says it is listening and the rows are in hand.
    // It must be called from a click with nothing asynchronous in front of
    // it: window.open needs the click. The rows may already be in hand or
    // be a promise of them, so a read can run after the click; a promise of
    // null is nothing to send after all, and the tab is closed.
    //
    // done(said) is called once: "" when the rows have gone, null when
    // there was nothing to send, or one of the store's words.
    function handOff(game, rows, done) {
      if (awaiting) {
        var replaced = awaiting;
        if (!replaced.opened.closed) {
          replaced.opened.close();
        }
        replaced.finish(words.replaced);
      }
      var opened = window.open(handoffURL(game), "_blank");
      if (!opened) {
        done(words.blocked);
        return;
      }

      var listening = "";
      var collected = null;
      var finished = false;
      var mine = null;

      function finish(said) {
        if (finished) {
          return;
        }
        finished = true;
        if (awaiting === mine) {
          stopWaiting();
        }
        done(said);
      }

      function give() {
        if (!listening || !collected) {
          return;
        }
        if (opened.closed) {
          finish(words.closed);
          return;
        }
        // Answered to the origin that spoke, which is where the page ended
        // up. source names the page the rows were read from, so the results
        // can say where they came from.
        opened.postMessage({ type: ROWS, csv: collected.csv, rows: collected.rows, source: location.href }, listening);
        finish("");
      }

      function onMessage(event) {
        if (
          event.source !== opened ||
          !BAN.isBanHost(event.origin) ||
          !event.data ||
          event.data.type !== READY
        ) {
          return;
        }
        window.removeEventListener("message", onMessage);
        listening = event.origin;
        give();
      }

      // A tab closed before it took the rows never will. Coming back to
      // this page is when that can be seen, with no timer: it is where the
      // person is.
      function onFocus() {
        if (opened.closed) {
          finish(words.closed);
        }
      }

      function take(got) {
        if (finished) {
          return;
        }
        if (!got) {
          // Nothing to hand over after all. The tab was opened on the
          // promise of rows, so it goes again rather than waiting for good.
          finish(null);
          opened.close();
          return;
        }
        collected = got;
        give();
      }

      mine = { listener: onMessage, onFocus: onFocus, opened: opened, finish: finish };
      awaiting = mine;
      window.addEventListener("message", onMessage);
      window.addEventListener("focus", onFocus);

      // Rows in hand are taken at once, so a page that is already listening
      // gets them in the same turn.
      if (rows && typeof rows.then === "function") {
        rows.then(take);
      } else {
        take(rows);
      }
    }

    return { handOff: handOff, handoffURL: handoffURL };
  };
})(globalThis.BAN);
