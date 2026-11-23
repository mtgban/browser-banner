// The panel on ManaPool (SPECIFICATIONS.md, section 4).
//
// ManaPool moves between its own pages without loading them, and a content
// script runs only when a page loads. So this runs on every page and follows
// the address: the order history, an order and the cart get their panels,
// and leaving one takes its panel away and stops what it started.

(function (MPB, BAN) {
  "use strict";

  // How often the address is looked at.
  var WATCH = 500;
  // ManaPool's first orders were placed in 2024.
  var FIRST_YEAR = 2024;
  var RECENT = [30, 90, 120];

  var shown = null;

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function day(date) {
    return date.year * 10000 + date.month * 100 + date.day;
  }

  // history is the order history's panel: a range and Download CSV.
  function history() {
    var panel = MPB.panel();
    var run = null;

    var now = new Date().getFullYear();
    var choices = RECENT.map(function (days) {
      return ["days:" + days, days + " days"];
    });
    choices.push(["all", "All years"]);
    for (var y = now; y >= FIRST_YEAR; y--) {
      choices.push([String(y), String(y)]);
    }
    var picker = BAN.rangePicker(choices, String(now));
    panel.actions.appendChild(picker);

    // chosen is the picker's choice, { year, days }: a year, or both null
    // for every year, or a number of recent days.
    function chosen() {
      var days = /^days:(\d+)$/.exec(picker.value);
      if (days) {
        return { year: null, days: Number(days[1]) };
      }
      return { year: picker.value === "all" ? null : Number(picker.value), days: null };
    }

    function stop() {
      if (run) {
        run = null;
        panel.busy(false);
      }
    }

    function save() {
      if (run) {
        return;
      }
      var token = {};
      run = token;
      var c = chosen();
      var today = BAN.today();
      var since = c.days ? BAN.daysBefore(today, c.days) : null;
      // The API is asked from the range's first day, in the browser's time.
      var from = since
        ? new Date(since.year, since.month - 1, since.day)
        : c.year !== null ? new Date(c.year, 0, 1) : null;
      panel.clear();
      panel.word("reading");
      panel.busy(true);
      MPB.listOrders(from ? from.toISOString() : "", function (n) {
        if (run !== token) {
          return false;
        }
        if (n > 1) {
          panel.word("page " + n);
        }
        return true;
      })
        .then(function (orders) {
          if (run !== token || !orders) {
            return;
          }
          stop();
          var rows = [];
          var unreadable = 0;
          for (var i = 0; i < orders.length; i++) {
            var r = MPB.orderRow(orders[i]);
            if (!r) {
              unreadable++;
            } else if (c.days ? day(r.date) >= day(since) : c.year === null || r.date.year === c.year) {
              rows.push(r);
            }
          }
          rows.sort(function (a, b) {
            return b.placed - a.placed;
          });
          var left = unreadable ? "; " + plural(unreadable, "order", "orders") + " unreadable, left out" : "";
          panel.mark("done");
          if (!rows.length) {
            panel.word("no orders");
            panel.recap("No orders in that range" + left);
            return;
          }
          var name = BAN.rangeFile("mp-orders", c, today);
          MPB.download(MPB.historyCSV(rows), name);
          panel.word(plural(rows.length, "order", "orders"));
          panel.recap("Saved " + name + ": " + plural(rows.length, "order", "orders") + left);
        })
        .catch(function (err) {
          if (run !== token) {
            return;
          }
          stop();
          panel.word("");
          panel.fail(err && err.message ? err.message : String(err));
        });
    }

    var go = document.createElement("button");
    go.type = "button";
    go.className = "ban-go";
    go.textContent = "Download CSV";
    go.addEventListener("click", save);
    panel.actions.appendChild(go);
    panel.hint("Save your orders as CSV, one line per order");

    return {
      panel: panel,
      cancel: function () {
        if (run) {
          stop();
          panel.word("");
          panel.clear();
        }
      },
      leave: function () {
        stop();
        panel.root.remove();
      },
    };
  }

  // cart is the cart's panel, and two buttons under each seller's name:
  // Remove seller, and Only this seller, which sets every other seller's
  // items aside for Put back.
  function cart() {
    var panel = MPB.panel();
    var run = null;

    var back = document.createElement("button");
    back.type = "button";
    back.className = "ban-go";
    back.textContent = "Put back";
    panel.actions.appendChild(back);

    function stashed() {
      return MPB.stash().items.length;
    }

    function idle() {
      var n = stashed();
      back.disabled = !n;
      panel.word(n ? plural(n, "item", "items") + " set aside" : "");
      panel.hint(n
        ? "Put back the items Only this seller set aside, from the sellers they came from"
        : "Under each seller: Remove seller, or Only this seller to set the others aside");
    }

    function stop() {
      if (run) {
        run = null;
        panel.busy(false);
      }
    }

    function going(token) {
      return function () {
        return run === token;
      };
    }

    // take removes items one at a time, calling kept for each one taken.
    function take(items, what, kept, done) {
      if (run) {
        return;
      }
      var token = {};
      run = token;
      panel.clear();
      panel.word(what);
      panel.busy(true);
      var taken = 0;
      MPB.removeAll(items, function (li, gone) {
        taken++;
        kept(li, gone);
        panel.word(what + " " + taken + "/" + items.length);
      }, going(token))
        .then(function () {
          if (run !== token) {
            return;
          }
          stop();
          idle();
          panel.mark("done");
          panel.recap(done(taken));
        })
        .catch(function (err) {
          if (run !== token) {
            return;
          }
          stop();
          idle();
          panel.fail((err && err.message ? err.message : String(err)) + "; " + plural(taken, "item", "items") + " taken out before it");
        });
    }

    function removeSeller(seller) {
      // The items as the page shows them now: ManaPool may have redrawn
      // them since the button was.
      var now = MPB.sellers(document).filter(function (s) {
        return s.slug === seller.slug;
      })[0];
      take(now ? now.items : [], "removing", function () {}, function (n) {
        return "Removed " + plural(n, "item", "items") + " from " + seller.name;
      });
    }

    function onlySeller(seller) {
      var others = MPB.sellers(document).filter(function (s) {
        return s.slug !== seller.slug;
      });
      var items = [];
      var owners = [];
      others.forEach(function (s) {
        s.items.forEach(function (li) {
          items.push(li);
          owners.push(s);
        });
      });
      take(items, "setting aside", function (li, gone) {
        var owner = owners[items.indexOf(li)];
        var stash = MPB.stash();
        stash.items.push({ entry: gone[0], seller: { slug: owner.slug, name: owner.name }, item: MPB.itemOf(li) });
        MPB.keepStash(stash);
      }, function (n) {
        return "Set aside " + plural(n, "item", "items") + " from " + plural(others.length, "other seller", "other sellers") +
          "; only " + seller.name + " is left to check out";
      });
    }

    function putBack() {
      if (run) {
        return;
      }
      var stash = MPB.stash();
      var added;
      try {
        added = MPB.putBack(stash.items);
      } catch (err) {
        panel.fail(err.message);
        return;
      }
      var token = {};
      run = token;
      panel.clear();
      panel.word("putting back");
      panel.busy(true);
      // ManaPool's sync has run once the stored cart no longer carries the
      // changes written; whatever it then leaves out is no longer there to
      // buy. The set-aside list is kept until that is known.
      var written = stash.items.map(function (s) {
        return s.entry.inventoryId;
      });
      MPB.waitFor(function () {
        var cart = MPB.stored();
        return cart && !cart.changes.some(function (c) {
          return written.indexOf(c[0]) >= 0;
        }) ? cart : null;
      }, MPB.SYNC).then(function (cart) {
        if (run !== token) {
          return;
        }
        stop();
        if (!cart) {
          idle();
          panel.fail("ManaPool has not synced the cart yet; keep its tab in front, then Put back again");
          return;
        }
        var missing = stash.items.filter(function (s) {
          return !cart.cart.entries.some(function (e) {
            return e.inventoryId === s.entry.inventoryId;
          });
        });
        MPB.keepStash({ items: [] });
        idle();
        panel.mark(missing.length ? "failed" : "done");
        panel.recap("Put back " + plural(stash.items.length - missing.length, "item", "items") +
          (missing.length ? "; no longer listed: " + missing.map(function (s) {
            return s.item.name + " from " + s.seller.name;
          }).join(", ") : ""));
      });
    }

    back.addEventListener("click", putBack);
    idle();

    // buttons puts Remove seller and Only this seller under each seller's
    // name, where ManaPool's redraw has not left them already.
    function buttons() {
      MPB.sellers(document).forEach(function (seller) {
        if (seller.header.querySelector(".ban-seller")) {
          return;
        }
        var row = document.createElement("div");
        row.className = "ban-seller";
        [["Remove seller", removeSeller], ["Only this seller", onlySeller]].forEach(function (b) {
          var made = document.createElement("button");
          made.type = "button";
          made.textContent = b[0];
          made.addEventListener("click", function () {
            b[1](seller);
          });
          row.appendChild(made);
        });
        seller.header.appendChild(row);
      });
    }

    return {
      panel: panel,
      refresh: buttons,
      cancel: function () {
        if (run) {
          stop();
          idle();
          panel.clear();
        }
      },
      leave: function () {
        stop();
        panel.root.remove();
        Array.prototype.forEach.call(document.querySelectorAll(".ban-seller"), function (row) {
          row.remove();
        });
      },
    };
  }

  // order is one order's panel: Send to BAN and CSV, its cards read from
  // the API on the click.
  function order(id) {
    var panel = MPB.panel();
    var run = null;
    var got = null;

    // read answers with the order and its lines, asking the API once.
    function read() {
      got = got || MPB.getOrder(id).then(function (o) {
        return { number: o && o.order_number, lines: MPB.orderLines(o) };
      });
      got.catch(function () {
        got = null;
      });
      return got;
    }

    function left(read) {
      var l = read.lines.left;
      var out = [];
      if (l.refunded) {
        out.push(plural(l.refunded, "refunded card", "refunded cards"));
      }
      if (l.away) {
        out.push(plural(l.away, "card", "cards") + " replaced by another order");
      }
      if (l.unnamed) {
        out.push(plural(l.unnamed, "card", "cards") + " replaced with one ManaPool does not name");
      }
      if (l.sealed) {
        out.push(plural(l.sealed, "sealed product", "sealed products"));
      }
      if (l.unreadable) {
        out.push(plural(l.unreadable, "unreadable line", "unreadable lines"));
      }
      return out.length ? "; left out: " + out.join(", ") : "";
    }

    function cards(read) {
      return read.lines.lines.reduce(function (n, l) {
        return n + l.quantity;
      }, 0);
    }

    function failed(token) {
      return function (err) {
        if (run !== token) {
          return;
        }
        run = null;
        panel.busy(false);
        panel.fail(err && err.message ? err.message : String(err));
      };
    }

    function save() {
      if (run) {
        return;
      }
      var token = {};
      run = token;
      panel.clear();
      panel.busy(true);
      read()
        .then(function (r) {
          if (run !== token) {
            return;
          }
          run = null;
          panel.busy(false);
          panel.word(plural(cards(r), "card", "cards"));
          if (!r.lines.lines.length) {
            panel.fail("No cards to save" + left(r));
            return;
          }
          var name = "mp-order-" + r.number + ".csv";
          MPB.download(MPB.orderCSV(r.lines.lines), name);
          panel.mark("done");
          panel.recap("Saved " + name + left(r));
        })
        .catch(failed(token));
    }

    // send opens mtgban's page on the click itself, as it must, and hands it
    // the rows once they are read.
    function send() {
      if (run) {
        return;
      }
      var token = {};
      run = token;
      var r = null;
      panel.clear();
      panel.recap("Waiting for mtgban's upload page to take the order");
      // A read that fails is said here and handed over as nothing to send,
      // which closes the tab the click opened.
      var rows = read().then(function (got) {
        r = got;
        return got.lines.lines.length ? { csv: MPB.orderCSV(got.lines.lines), rows: got.lines.lines.length } : null;
      }, function (err) {
        failed(token)(err);
        return null;
      });
      MPB.handOff(rows, function (said) {
        if (run !== token) {
          return;
        }
        run = null;
        if (said === MPB.REPLACED) {
          return;
        }
        if (said === null) {
          panel.fail("No cards to send" + (r ? left(r) : ""));
          return;
        }
        if (said) {
          panel.fail(said);
          return;
        }
        panel.word(plural(cards(r), "card", "cards"));
        panel.mark("done");
        panel.recap("Sent " + plural(cards(r), "card", "cards") + " to BAN" + left(r));
      });
    }

    [["ban-go ban-send", "Send to BAN", send], ["ban-go ban-csv", "CSV", save]].forEach(function (b) {
      var made = document.createElement("button");
      made.type = "button";
      made.className = b[0];
      made.textContent = b[1];
      made.addEventListener("click", b[2]);
      panel.actions.appendChild(made);
    });
    panel.hint("Send this order's cards to BAN, or save them as CSV");

    return {
      panel: panel,
      cancel: function () {
        if (run) {
          run = null;
          panel.busy(false);
          panel.clear();
        }
      },
      leave: function () {
        run = null;
        panel.busy(false);
        panel.root.remove();
      },
    };
  }

  // route is the panel a path gets, or null.
  function route(path) {
    if (/^\/settings\/orders\/?$/.test(path)) {
      return history;
    }
    var id = /^\/settings\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/.exec(path);
    if (id) {
      return function () {
        return order(id[1]);
      };
    }
    return /^\/cart\/?$/.test(path) ? cart : null;
  }

  function follow() {
    var path = location.pathname;
    var wanted = route(path);
    if (shown && (shown.path !== path || !wanted)) {
      shown.leave();
      shown = null;
    }
    if (wanted && !shown) {
      shown = wanted();
      shown.path = path;
    }
    // ManaPool redraws its page as it goes, so the panel is put back if a
    // redraw took it.
    if (shown && !shown.panel.root.isConnected) {
      document.body.appendChild(shown.panel.root);
    }
    if (shown && shown.refresh) {
      shown.refresh();
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && shown && !MPB.keying) {
      shown.cancel();
    }
  });
  follow();
  setInterval(follow, WATCH);
})(globalThis.MPB, globalThis.BAN);
