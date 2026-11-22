// Asks a store for its own pages, one at a time and slowly.
//
// Every store sits behind Cloudflare, which reads a burst of fetches as a
// bot and answers with a challenge meant for a person. So nothing here fans
// out, and a challenge stops the work instead of being retried: nothing an
// extension sends can answer it.
//
// A factory and nothing else: each store makes its own, named for it, and
// binds what it uses onto its own global, PACE included, which tests swap.

globalThis.BAN = globalThis.BAN || {};

(function (BAN) {
  "use strict";

  // TIMEOUT bounds one request, so a connection that goes quiet fails the
  // read instead of leaving the spinner turning.
  var TIMEOUT = 30000;

  // net makes one store's requests, its messages naming the store by its
  // full name. options.slowDown says a 429 with no challenge is the
  // store asking to slow down, BUSY, rather than an ordinary refusal.
  BAN.net = function (store, options) {
    var opts = options || {};
    var net = {
      CHALLENGE: store + " is checking the browser; reload and try again",
      BUSY: store + " asked to slow down; wait a minute and try again",
      TIMED_OUT: store + " did not answer in time",
    };

    // deadline is a signal that aborts after ms, TIMEOUT by default, where
    // the browser has AbortSignal.timeout.
    net.deadline = function (ms) {
      if (typeof AbortSignal === "undefined" || !AbortSignal.timeout) {
        return undefined;
      }
      return AbortSignal.timeout(ms || TIMEOUT);
    };

    // challenged tells a Cloudflare challenge from an ordinary refusal:
    // both can be a 403 or a 429, and only the challenge carries this
    // header.
    net.challenged = function (response) {
      return response.headers.get("cf-mitigated") === "challenge";
    };

    // check turns a challenge or a refusal into the error that says so.
    net.check = function (response) {
      if (net.challenged(response)) {
        throw new Error(net.CHALLENGE);
      }
      if (opts.slowDown && response.status === 429) {
        throw new Error(net.BUSY);
      }
      if (!response.ok) {
        throw new Error(store + " answered " + response.status);
      }
      return response;
    };

    // timedOut says a deadline in words: the browser's own wording, "signal
    // timed out", names the mechanism rather than what happened.
    net.timedOut = function (err) {
      if (err && err.name === "TimeoutError") {
        throw new Error(net.TIMED_OUT);
      }
      throw err;
    };

    net.after = function (ms) {
      if (!ms) {
        return Promise.resolve();
      }
      return new Promise(function (resume) {
        setTimeout(resume, ms);
      });
    };

    // fetchPage reads one of this origin's pages the way a page load asks
    // for it, with the visitor's own session, and answers with it parsed.
    net.fetchPage = function (url) {
      return fetch(url, {
        credentials: "same-origin",
        signal: net.deadline(),
        headers: { Accept: "text/html,application/xhtml+xml" },
      })
        .then(net.check)
        .then(function (response) {
          return response.text();
        })
        .then(function (text) {
          return new DOMParser().parseFromString(text, "text/html");
        })
        .catch(net.timedOut);
    };

    return net;
  };
})(globalThis.BAN);
