// The content script on TCGplayer's cart: Only this seller beside each
// package's Remove all items and Save all items, and Put back on the panel.
//
// Only this seller takes every other package's items out of the cart and
// keeps them, each with its seller and price; Put back adds them again.
// TCGplayer's page does not hear of a change made through its API, so each
// ends by reloading it, and the panel says what was done once it is back.

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB) {
  "use strict";

  if (location.hostname !== "www.tcgplayer.com") {
    return;
  }

  // WATCH is how often the page is looked at: TCGplayer's cart is a page of
  // its own app, reached without a load and drawn after it.
  var WATCH = 500;
  TCGB.SAID_KEY = "banner-tcgplayer-said";

  TCGB.reload = function () {
    location.reload();
  };

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function dollars(n) {
    return "$" + Number(n).toFixed(2);
  }

  // named is how a set-aside listing is told: its card, from products,
  // and the package it was set aside from.
  function named(s, products) {
    return (products[s.sku] || "SKU " + s.sku) + " from " + (s.sellerName || "seller " + s.sellerKey);
  }

  // keepSaid keeps what a run did for the panel to show once the page is
  // back; a page that keeps nothing still reloads.
  function keepSaid(text, failed) {
    try {
      sessionStorage.setItem(TCGB.SAID_KEY, JSON.stringify({ text: text, failed: !!failed }));
    } catch (err) {
      return;
    }
  }

  function said() {
    try {
      var got = JSON.parse(sessionStorage.getItem(TCGB.SAID_KEY));
      sessionStorage.removeItem(TCGB.SAID_KEY);
      return got && typeof got.text === "string" ? got : null;
    } catch (err) {
      return null;
    }
  }

  function cart() {
    var panel = TCGB.panel();
    document.body.appendChild(panel.root);
    var run = null;

    var back = document.createElement("button");
    back.type = "button";
    back.className = "ban-go";
    back.textContent = "Put back";
    panel.actions.appendChild(back);

    function idle() {
      var n = TCGB.stash().items.length;
      back.disabled = !n || !!run;
      panel.word(n ? plural(n, "item", "items") + " set aside" : "");
      panel.hint(n
        ? "Put back the items Only this seller set aside, from the sellers they came from"
        : "Beside each seller: Only this seller, to set the others aside");
    }

    function start(what) {
      var key = TCGB.cartKey(document.cookie);
      if (run) {
        return "";
      }
      panel.clear();
      if (!key) {
        panel.fail(TCGB.NO_CART);
        return "";
      }
      run = {};
      back.disabled = true;
      panel.word(what);
      panel.busy(true);
      return key;
    }

    // say ends a run: it says what was done and, where the cart changed,
    // reloads the page to show the cart as TCGplayer now holds it.
    function say(text, failed, changed) {
      run = null;
      panel.busy(false);
      idle();
      panel.mark(failed ? "failed" : "done");
      panel.recap(text);
      if (changed) {
        keepSaid(text, failed);
        TCGB.reload();
      }
    }

    function failed(err) {
      run = null;
      panel.busy(false);
      idle();
      panel.fail(err && err.message ? err.message : String(err));
    }

    // onlySeller sets aside every item outside pkg, and checks with the cart
    // which ones it took out: the set-aside list keeps only those.
    function onlySeller(pkg) {
      var key = start("reading the cart");
      if (!key) {
        return;
      }
      var others;
      var refused = null;
      TCGB.readCart(key)
        .then(function (items) {
          // A gift card is not a seller's listing, and stays.
          others = items.filter(function (item) {
            return TCGB.packageOf(item) !== pkg.key && !item.giftCardKey;
          });
          if (!others.length) {
            return null;
          }
          var sellers = {};
          TCGB.packages(document).forEach(function (p) {
            sellers[p.key] = p.name;
          });
          // An entry the cart holds again was put back by other means.
          var stash = TCGB.stash();
          stash.items = stash.items.filter(function (s) {
            return !TCGB.holds(items, s);
          });
          others.forEach(function (item) {
            TCGB.setAside(stash, TCGB.kept(item, sellers));
          });
          TCGB.keepStash(stash);
          panel.word("setting aside " + plural(others.length, "item", "items"));
          return TCGB.after(TCGB.PACE)
            .then(function () {
              return TCGB.removeItems(key, others.map(function (item) {
                return item.cartItemId;
              }));
            })
            .catch(function (err) {
              refused = err;
            })
            .then(function () {
              panel.word("checking the cart");
              return TCGB.after(TCGB.PACE);
            })
            .then(function () {
              return TCGB.readCart(key);
            });
        })
        .then(function (after) {
          if (!after) {
            say("Only " + pkg.name + " is in the cart");
            return;
          }
          var still = others.filter(function (item) {
            return after.some(function (now) {
              return now.cartItemId === item.cartItemId;
            });
          });
          var stash = TCGB.stash();
          still.forEach(function (item) {
            TCGB.unsetAside(stash, TCGB.kept(item, {}));
          });
          TCGB.keepStash(stash);
          var taken = others.length - still.length;
          var sellers = [];
          others.forEach(function (item) {
            if (sellers.indexOf(TCGB.packageOf(item)) < 0) {
              sellers.push(TCGB.packageOf(item));
            }
          });
          if (refused || still.length) {
            say((refused ? refused.message + "; " : "TCGplayer kept " + plural(still.length, "item", "items") + " in the cart; ") +
              plural(taken, "item", "items") + " set aside", true, taken > 0);
            return;
          }
          say("Set aside " + plural(taken, "item", "items") + " from " + plural(sellers.length, "other seller", "other sellers") +
            "; only " + pkg.name + " is left to check out", false, true);
        })
        .catch(failed);
    }

    // putBack adds again what the cart does not hold, and checks with the
    // cart what came back: a listing that did not is no longer for sale.
    function putBack() {
      var key = start("reading the cart");
      if (!key) {
        return;
      }
      var stash = TCGB.stash();
      var refused = null;
      var missing = [];
      TCGB.readCart(key)
        .then(function (items) {
          missing = stash.items.filter(function (s) {
            return !TCGB.holds(items, s);
          });
          if (!missing.length) {
            return items;
          }
          panel.word("putting back " + plural(missing.length, "item", "items"));
          return TCGB.after(TCGB.PACE)
            .then(function () {
              return TCGB.addItems(key, missing);
            })
            .catch(function (err) {
              refused = err;
            })
            .then(function () {
              panel.word("checking the cart");
              return TCGB.after(TCGB.PACE);
            })
            .then(function () {
              return TCGB.readCart(key);
            });
        })
        .then(function (after) {
          var gone = stash.items.filter(function (s) {
            return !TCGB.holds(after, s);
          });
          var changed = [];
          stash.items.forEach(function (s) {
            if (gone.indexOf(s) >= 0) {
              return;
            }
            var now = after.filter(function (item) {
              return item.sku === s.sku && item.sellerKey === s.sellerKey;
            })[0];
            if (now && Math.round(now.currentPrice * 100) !== Math.round(s.price * 100)) {
              changed.push({ s: s, now: now.currentPrice });
            }
          });
          var n = stash.items.length - gone.length;
          // Refused, what did not come back stays set aside to try again;
          // otherwise TCGplayer took the rest and has none of it to sell.
          TCGB.keepStash({ items: refused ? gone : [] });
          var told = (gone.length && !refused ? gone : []).concat(changed.map(function (c) {
            return c.s;
          }));
          var names = !told.length
            ? Promise.resolve({})
            : TCGB.after(TCGB.PACE)
              .then(function () {
                panel.word("naming the cards");
                return TCGB.productNames(told.map(function (s) {
                  return s.sku;
                }));
              })
              .catch(function () {
                return {};
              });
          return names.then(function (products) {
            var text = (refused ? refused.message + "; put back " : "Put back ") + plural(n, "item", "items") +
              (gone.length && !refused ? "; no longer for sale: " + gone.map(function (s) {
                return named(s, products);
              }).join(", ") : "") +
              (changed.length ? "; price changed: " + changed.map(function (c) {
                return named(c.s, products) + ", " + dollars(c.s.price) + " now " + dollars(c.now);
              }).join("; ") : "");
            say(text, !!refused || gone.length > 0, missing.some(function (s) {
              return TCGB.holds(after, s);
            }));
          });
        })
        .catch(failed);
    }

    back.addEventListener("click", putBack);
    idle();
    var last = said();
    if (last) {
      panel.mark(last.failed ? "failed" : "done");
      panel.recap(last.text);
    }

    // buttons puts Only this seller beside each package's own actions, where
    // TCGplayer's redraw has not left it already.
    function buttons() {
      TCGB.packages(document).forEach(function (pkg) {
        if (pkg.actions.querySelector(".ban-only")) {
          return;
        }
        var made = document.createElement("button");
        made.type = "button";
        made.className = "ban-only";
        made.textContent = "Only this seller";
        made.addEventListener("click", function () {
          onlySeller(pkg);
        });
        pkg.actions.appendChild(made);
      });
    }

    return {
      panel: panel,
      refresh: buttons,
      leave: function () {
        panel.root.remove();
        Array.prototype.forEach.call(document.querySelectorAll(".ban-only"), function (b) {
          b.remove();
        });
      },
    };
  }

  var shown = null;

  function follow() {
    var onCart = /^\/cart\/?$/i.test(location.pathname);
    if (shown && !onCart) {
      shown.leave();
      shown = null;
    }
    if (onCart && !shown) {
      shown = cart();
    }
    if (shown && !shown.panel.root.isConnected) {
      document.body.appendChild(shown.panel.root);
    }
    if (shown) {
      shown.refresh();
    }
  }

  follow();
  setInterval(follow, WATCH);
})(globalThis.TCGB);
