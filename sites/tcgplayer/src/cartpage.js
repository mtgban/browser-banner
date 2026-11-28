// The content script on TCGplayer's cart: Only this seller in a row above
// each package's Remove all items and Save all items, Consolidate
// beside it on Direct's, and Put back on the panel.
//
// Only this seller takes every other package's items out of the cart and
// keeps them, each with its seller and price; Consolidate does the same
// with every item Direct does not ship and adds back from Direct what it
// can at the same price; Put back adds again what is kept.
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

  function count(items) {
    return items.reduce(function (n, item) {
      return n + item.quantity;
    }, 0);
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
      panel.word(n ? n + " in stash" : "");
      panel.hint(n
        ? "Put back what is in stash, from the sellers it came from"
        : "Beside each seller: Only this seller, to set the others aside; beside Direct: Consolidate");
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
          setAsideAll(others, items);
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
          var stash = TCGB.stash();
          var still = keptBack(others, after, stash);
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
              taken + " in stash", true, taken > 0);
            return;
          }
          say("Set aside " + plural(taken, "item", "items") + " from " + plural(sellers.length, "other seller", "other sellers") +
            "; only " + pkg.name + " is left to check out", false, true);
        })
        .catch(failed);
    }

    // setAsideAll keeps items in the stash before they are taken out, with
    // the name the page heads each one's package with; an earlier entry the
    // cart holds again was put back by other means and is dropped.
    function setAsideAll(items, all) {
      var sellers = {};
      TCGB.packages(document).forEach(function (p) {
        sellers[p.key] = p.name;
      });
      var stash = TCGB.stash();
      stash.items = stash.items.filter(function (s) {
        return !TCGB.holds(all, s);
      });
      items.forEach(function (item) {
        TCGB.setAside(stash, TCGB.kept(item, sellers));
      });
      TCGB.keepStash(stash);
    }

    // keptBack is the run's items the cart still holds, by cartItemId, each
    // taken off the stash again: TCGplayer kept them.
    function keptBack(others, after, stash) {
      var still = others.filter(function (item) {
        return after.some(function (now) {
          return now.cartItemId === item.cartItemId;
        });
      });
      still.forEach(function (item) {
        TCGB.unsetAside(stash, TCGB.kept(item, {}));
      });
      return still;
    }

    function cards(n) {
      return plural(n, "card", "cards");
    }

    function directAt(items, key) {
      return items.reduce(function (n, item) {
        return n + (item.isDirect && TCGB.priceKey(item.sku, item.currentPrice) === key ? item.quantity : 0);
      }, 0);
    }

    // consolidate sets aside every item Direct does not ship and adds back
    // from Direct, at the same price, as many of each card as Direct has
    // room for; what Direct gained comes off the set-aside list again.
    function consolidate() {
      var key = start("reading the cart");
      if (!key) {
        return;
      }
      var before;
      var others;
      var products = {};
      var refused = null;
      TCGB.readCart(key)
        .then(function (items) {
          before = items;
          others = items.filter(function (item) {
            return !item.isDirect && !item.giftCardKey;
          });
          if (!others.length) {
            return null;
          }
          var skus = [];
          others.forEach(function (item) {
            if (skus.indexOf(item.sku) < 0) {
              skus.push(item.sku);
            }
          });
          panel.word("asking for Direct's stock");
          return TCGB.after(TCGB.PACE)
            .then(function () {
              return TCGB.products(skus);
            })
            .then(function (found) {
              products = found;
              var lines = [];
              var seen = [];
              others.forEach(function (item) {
                var at = TCGB.priceKey(item.sku, item.currentPrice);
                if (seen.indexOf(at) < 0 && products[item.sku]) {
                  seen.push(at);
                  lines.push({ sku: item.sku, productId: products[item.sku].productId, price: item.currentPrice });
                }
              });
              return TCGB.after(TCGB.PACE).then(function () {
                return TCGB.directStock(lines);
              });
            })
            .then(function (stock) {
              var adds = TCGB.directPlan(items, stock);
              setAsideAll(others, items);
              panel.word("consolidating " + cards(count(others)) + " into Direct");
              return TCGB.after(TCGB.PACE)
                .then(function () {
                  return TCGB.removeItems(key, others.map(function (item) {
                    return item.cartItemId;
                  }));
                })
                .then(function () {
                  if (!adds.length) {
                    return null;
                  }
                  return TCGB.after(TCGB.PACE).then(function () {
                    return TCGB.addItems(key, adds);
                  });
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
            });
        })
        .then(function (after) {
          if (!after) {
            say("Only TCGplayer Direct is in the cart");
            return;
          }
          var stash = TCGB.stash();
          var still = keptBack(others, after, stash);
          // What Direct gained of a card at a price stands for as many of
          // the items set aside there.
          var moved = 0;
          var short = [];
          var groups = [];
          others.forEach(function (item) {
            var at = TCGB.priceKey(item.sku, item.currentPrice);
            if (groups.indexOf(at) < 0) {
              groups.push(at);
            }
          });
          groups.forEach(function (at) {
            var here = others.filter(function (item) {
              return TCGB.priceKey(item.sku, item.currentPrice) === at && still.indexOf(item) < 0;
            });
            var wanted = count(here);
            var gained = Math.min(wanted, Math.max(0, directAt(after, at) - directAt(before, at)));
            moved += gained;
            var left = gained;
            here.forEach(function (item) {
              var n = Math.min(left, item.quantity);
              if (n > 0) {
                var kept = TCGB.kept(item, {});
                kept.quantity = n;
                TCGB.unsetAside(stash, kept);
                left -= n;
              }
            });
            if (gained < wanted && here.length) {
              var sku = here[0].sku;
              short.push((products[sku] ? products[sku].name : "SKU " + sku) + ", " + (wanted - gained) + " of " + wanted);
            }
          });
          TCGB.keepStash(stash);
          var aside = count(others) - count(still) - moved;
          var changed = aside > 0 || moved > 0;
          if (refused || still.length) {
            say((refused ? refused.message + "; " : "TCGplayer kept " + plural(still.length, "item", "items") + " out of Direct; ") +
              "consolidated " + cards(moved) + " into Direct; " + cards(aside) + " in stash", true, changed);
            return;
          }
          say("Consolidated " + cards(moved) + " into Direct" +
            (aside ? "; " + cards(aside) + " in stash that Direct has no room for: " + short.join("; ") : ""), false, changed);
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
              return item.sku === s.sku && item.sellerKey === s.sellerKey && !!item.isDirect === !!s.isDirect;
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

    // buttons puts a row with Only this seller, and Consolidate on Direct's,
    // above each package's own actions, where TCGplayer's redraw has not
    // left one already.
    function buttons() {
      TCGB.packages(document).forEach(function (pkg) {
        var above = pkg.actions.previousElementSibling;
        if (above && above.classList.contains("ban-row")) {
          return;
        }
        var row = document.createElement("div");
        row.className = "ban-row";
        var made = document.createElement("button");
        made.type = "button";
        made.className = "ban-only";
        made.textContent = "Only this seller";
        made.addEventListener("click", function () {
          onlySeller(pkg);
        });
        row.appendChild(made);
        if (pkg.key === "direct") {
          var merge = document.createElement("button");
          merge.type = "button";
          merge.className = "ban-consolidate";
          merge.textContent = "Consolidate";
          merge.addEventListener("click", consolidate);
          row.appendChild(merge);
        }
        pkg.actions.parentNode.insertBefore(row, pkg.actions);
      });
    }

    return {
      panel: panel,
      refresh: buttons,
      leave: function () {
        panel.root.remove();
        Array.prototype.forEach.call(document.querySelectorAll(".ban-row"), function (b) {
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
