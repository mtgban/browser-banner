// The panel on ManaPool (SPECIFICATIONS.md, section 4).
//
// ManaPool moves between its own pages without loading them, and a content
// script runs only when a page loads. So this runs on every page and follows
// the address: the order history gets its panel, and leaving it takes the
// panel away and stops any read it started.

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

  // route is the panel a path gets, or null.
  function route(path) {
    return /^\/settings\/orders\/?$/.test(path) ? history : null;
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
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && shown) {
      shown.cancel();
    }
  });
  follow();
  setInterval(follow, WATCH);
})(globalThis.MPB, globalThis.BAN);
