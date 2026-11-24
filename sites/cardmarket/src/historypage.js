// The visitor's purchase history (SPECIFICATIONS.md, section 9): a range and
// Download CSV on a purchase list, one line per order, read page by page at
// Cardmarket's pace. The list runs newest first, so a range ends the walk at
// its first older order.

(function (MKM, BAN) {
  "use strict";

  var path = /^\/[a-z]{2}\/[^/]+\/Orders\/Purchases\/([A-Za-z]+)\/?$/.exec(location.pathname);
  if (!path || !document.querySelector("#StatusTable")) {
    return;
  }
  var tab = path[1];
  var status = tab === "NotArrived" ? "Not arrived" : tab;

  // The year Cardmarket opened, so no account's history is out of reach.
  var FIRST_YEAR = 2007;
  var RECENT = [30, 90, 120];

  var panel = MKM.panel();
  var picker = null;
  var go = null;
  var run = null;

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function day(date) {
    return date.year * 10000 + date.month * 100 + date.day;
  }

  // chosen is the picker's choice, { year, days }: a year, or both null for
  // every year, or a number of recent days.
  function chosen() {
    var days = /^days:(\d+)$/.exec(picker.value);
    if (days) {
      return { year: null, days: Number(days[1]) };
    }
    return { year: picker.value === "all" ? null : Number(picker.value), days: null };
  }

  function after(ms) {
    return new Promise(function (resume) {
      setTimeout(resume, ms);
    });
  }

  // walk reads pages from the first until the list ends or an order is
  // older than the range, and answers with the orders in it.
  function walk(c, since, token) {
    var orders = [];
    var seen = Object.create(null);
    var unreadable = 0;
    var pages = 0;

    // take keeps a page's orders in range, and says whether one was older.
    function take(doc) {
      pages++;
      var read = MKM.readOrders(doc);
      unreadable += read.unreadable;
      var past = false;
      for (var i = 0; i < read.orders.length; i++) {
        var o = read.orders[i];
        if (seen[o.id]) {
          continue;
        }
        seen[o.id] = true;
        var at = day(o.date);
        if (c.days ? at < day(since) : c.year !== null && o.date.year < c.year) {
          past = true;
        } else if (c.year === null || o.date.year === c.year) {
          orders.push(o);
        }
      }
      return past;
    }

    function step(doc, href) {
      if (run !== token) {
        return null;
      }
      var past = take(doc);
      var next = MKM.nextPageURL(doc, href);
      if (past || !next) {
        return { orders: orders, pages: pages, unreadable: unreadable, read: Object.keys(seen).length };
      }
      panel.word("page " + (pages + 1));
      return after(MKM.PACE)
        .then(function () {
          return run === token ? MKM.fetchPage(next) : null;
        })
        .then(function (fetched) {
          return fetched ? step(fetched, next) : null;
        });
    }

    var first = MKM.firstPageURL(location.href);
    if (!first) {
      return Promise.resolve(step(document, location.href));
    }
    panel.word("page 1");
    return MKM.fetchPage(first).then(function (fetched) {
      return step(fetched, first);
    });
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
    panel.clear();
    panel.busy(true);
    walk(c, since, token)
      .then(function (done) {
        if (run !== token || !done) {
          return;
        }
        run = null;
        panel.busy(false);
        var left = done.unreadable ? "; " + plural(done.unreadable, "order", "orders") + " unreadable, left out" : "";
        // An order that does not read has no date, so it says nothing of the
        // range unless none read.
        if (!done.read && done.unreadable) {
          panel.word(done.unreadable + " unreadable");
          panel.fail("Nothing saved: " + plural(done.unreadable, "order", "orders") + " could not be read");
          return;
        }
        if (!done.orders.length) {
          panel.word("no orders");
          panel.mark("done");
          panel.recap("No orders in that range. Read " + plural(done.pages, "page", "pages") + left);
          return;
        }
        var name = BAN.rangeFile("cm-purchases-" + tab.toLowerCase(), c, today);
        MKM.download(MKM.historyCSV(done.orders, status), name);
        panel.word(plural(done.orders.length, "order", "orders"));
        panel.mark("done");
        panel.recap("Saved " + name + ": " + plural(done.orders.length, "order", "orders") +
          ". Read " + plural(done.pages, "page", "pages") + left);
      })
      .catch(function (err) {
        if (run !== token) {
          return;
        }
        run = null;
        panel.busy(false);
        panel.word("");
        panel.fail(err && err.message ? err.message : String(err));
      });
  }

  function cancel() {
    if (!run) {
      return;
    }
    run = null;
    panel.busy(false);
    panel.word("");
    panel.clear();
  }

  var now = new Date().getFullYear();
  var choices = RECENT.map(function (days) {
    return ["days:" + days, days + " days"];
  });
  choices.push(["all", "All years"]);
  for (var y = now; y >= FIRST_YEAR; y--) {
    choices.push([String(y), String(y)]);
  }
  picker = BAN.rangePicker(choices, String(now));
  panel.actions.appendChild(picker);
  go = document.createElement("button");
  go.type = "button";
  go.className = "ban-save";
  go.textContent = "Download CSV";
  go.addEventListener("click", save);
  panel.actions.appendChild(go);
  panel.hint("Save this list's orders as CSV, one line per order");
  document.body.appendChild(panel.root);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      cancel();
    }
  });
})(globalThis.MKM, globalThis.BAN);
