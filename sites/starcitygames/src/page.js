// The panel on Star City Games' account pages (SPECIFICATIONS.md, section 5):
// a range and Download CSV on the order list, Send to BAN and CSV on an
// order.

(function (SCGB, BAN) {
  "use strict";

  // The year Star City Games opened, so no account's history is out of reach.
  var FIRST_YEAR = 1995;
  var RECENT = [30, 90, 120];

  var query = new URL(location.href).searchParams;
  var action = query.get("action");

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function day(date) {
    return date.year * 10000 + date.month * 100 + date.day;
  }

  function saying(err) {
    return err && err.message ? err.message : String(err);
  }

  function button(className, text, click) {
    var made = document.createElement("button");
    made.type = "button";
    made.className = className;
    made.textContent = text;
    made.addEventListener("click", click);
    return made;
  }

  // history is the order list's panel. Its total for an order is what the
  // order came to after store credit, so each order in range is opened.
  function history() {
    var panel = SCGB.panel();
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

    // reader asks for pages, PACE before each after the first, and answers
    // with null once the run is over.
    function reader(token) {
      var asked = 0;
      return function (url) {
        return (asked++ ? SCGB.after(SCGB.PACE) : Promise.resolve()).then(function () {
          return run === token ? SCGB.fetchPage(url) : null;
        });
      };
    }

    // list reads the order list newest first, until it ends or an order is
    // older than the range, and answers with the orders in range.
    function list(c, since, get, token) {
      var orders = [];
      var seen = Object.create(null);
      var visited = Object.create(null);
      var unreadable = 0;
      var pages = 0;

      function take(doc) {
        pages++;
        var read = SCGB.readList(doc);
        unreadable += read.unreadable;
        var past = false;
        read.orders.forEach(function (o) {
          if (seen[o.id]) {
            return;
          }
          seen[o.id] = true;
          if (c.days ? day(o.date) < day(since) : c.year !== null && o.date.year < c.year) {
            past = true;
          } else if (c.year === null || o.date.year === c.year) {
            orders.push(o);
          }
        });
        return past;
      }

      function step(doc, href) {
        if (!doc || run !== token) {
          return null;
        }
        visited[href] = true;
        var past = take(doc);
        var next = past ? "" : SCGB.nextPage(doc, href);
        if (!next || visited[next]) {
          return { orders: orders, unreadable: unreadable };
        }
        panel.word("page " + (pages + 1));
        return get(next).then(function (fetched) {
          return step(fetched, next);
        });
      }

      var first = SCGB.firstPage(location.href);
      if (!first) {
        return Promise.resolve().then(function () {
          return step(document, location.href);
        });
      }
      panel.word("page 1");
      return get(first).then(function (fetched) {
        return step(fetched, first);
      });
    }

    // open reads each order in turn into a line.
    function open(orders, get, token) {
      var rows = [];
      var unreadable = 0;

      function next(i) {
        if (run !== token) {
          return null;
        }
        if (i === orders.length) {
          return { rows: rows, unreadable: unreadable };
        }
        panel.word("order " + (i + 1) + "/" + orders.length);
        return get(SCGB.orderURL(orders[i].id)).then(function (doc) {
          if (!doc) {
            return null;
          }
          var row = SCGB.orderRow(SCGB.orderIn(doc, orders[i].id), orders[i].date);
          if (row) {
            rows.push(row);
          } else {
            unreadable++;
          }
          return next(i + 1);
        });
      }

      return next(0);
    }

    // blank says which lines have no amounts, and why.
    function blank(rows) {
      var without = rows.filter(function (r) {
        return r.cost.why;
      });
      if (!without.length) {
        return "";
      }
      return "; no amounts for " + without.map(function (r) {
        return r.number + " (" + r.cost.why + ")";
      }).join(", ");
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
      var get = reader(token);
      var listed = 0;
      panel.clear();
      panel.word("reading");
      panel.busy(true);
      list(c, since, get, token)
        .then(function (found) {
          if (!found) {
            return null;
          }
          listed = found.unreadable;
          return open(found.orders, get, token);
        })
        .then(function (done) {
          if (!done) {
            return;
          }
          run = null;
          panel.busy(false);
          panel.mark("done");
          var n = listed + done.unreadable;
          var left = n ? "; " + plural(n, "order", "orders") + " unreadable, left out" : "";
          if (!done.rows.length) {
            panel.word("no orders");
            panel.recap("No orders in that range" + left);
            return;
          }
          var name = BAN.rangeFile("scg-orders", c, today);
          SCGB.download(SCGB.historyCSV(done.rows), name);
          panel.word(plural(done.rows.length, "order", "orders"));
          panel.recap("Saved " + name + ": " + plural(done.rows.length, "order", "orders") + left + blank(done.rows));
        })
        .catch(function (err) {
          if (run !== token) {
            return;
          }
          run = null;
          panel.busy(false);
          panel.word("");
          panel.fail(saying(err));
        });
    }

    panel.actions.appendChild(button("ban-go", "Download CSV", save));
    panel.hint("Save your orders as CSV, one line per order; each order is opened for what it cost");

    return {
      panel: panel,
      cancel: function () {
        if (run) {
          run = null;
          panel.busy(false);
          panel.word("");
          panel.clear();
        }
      },
    };
  }

  // order is one order's panel: Send to BAN and CSV, its cards read from the
  // page on the click.
  function order(id) {
    var panel = SCGB.panel();
    var run = null;

    function read() {
      var found = SCGB.orderIn(document, id);
      if (!Array.isArray(found.items)) {
        throw new Error(SCGB.NO_ORDER);
      }
      return SCGB.orderLines(found, SCGB.printed(document));
    }

    function cards(r) {
      return r.lines.reduce(function (n, l) {
        return n + l.quantity;
      }, 0);
    }

    function left(r) {
      var l = r.left;
      var out = [];
      if (l.refunded) {
        out.push(plural(l.refunded, "refunded copy", "refunded copies"));
      }
      if (l.games) {
        out.push(plural(l.games, "card", "cards") + " of other games");
      }
      if (l.sealed) {
        out.push(plural(l.sealed, "product that is not a single", "products that are not singles"));
      }
      if (l.unreadable) {
        out.push(plural(l.unreadable, "unreadable line", "unreadable lines"));
      }
      return (out.length ? "; left out: " + out.join(", ") : "") +
        (r.unpriced ? "; " + plural(r.unpriced, "line", "lines") + " without a price" : "");
    }

    // got answers with the order's lines, or null having said why there is
    // nothing to act on.
    function got(what) {
      panel.clear();
      var r;
      try {
        r = read();
      } catch (err) {
        panel.fail(saying(err));
        return null;
      }
      if (!r.lines.length) {
        panel.fail("No cards to " + what + left(r));
        return null;
      }
      return r;
    }

    function save() {
      var r = run ? null : got("save");
      if (!r) {
        return;
      }
      var name = "scg-order-" + id + ".csv";
      SCGB.download(SCGB.orderCSV(r.lines), name);
      panel.word(plural(cards(r), "card", "cards"));
      panel.mark("done");
      panel.recap("Saved " + name + left(r));
    }

    function send() {
      var r = run ? null : got("send");
      if (!r) {
        return;
      }
      var token = {};
      run = token;
      panel.recap("Waiting for mtgban's upload page to take the order");
      SCGB.handOff({ csv: SCGB.orderCSV(r.lines), rows: r.lines.length }, function (said) {
        if (run !== token) {
          return;
        }
        run = null;
        if (said === SCGB.REPLACED) {
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

    panel.actions.appendChild(button("ban-go ban-send", "Send to BAN", send));
    panel.actions.appendChild(button("ban-go ban-csv", "CSV", save));
    panel.hint("Send this order's cards to BAN, or save them as CSV");

    return {
      panel: panel,
      cancel: function () {
        if (run) {
          run = null;
          panel.clear();
        }
      },
    };
  }

  var shown = null;
  if (action === "order_status") {
    shown = history();
  } else if (action === "view_order" && /^\d+$/.test(query.get("order_id") || "")) {
    shown = order(query.get("order_id"));
  }
  if (!shown) {
    return;
  }
  document.body.appendChild(shown.panel.root);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      shown.cancel();
    }
  });
})(globalThis.SCGB, globalThis.BAN);
