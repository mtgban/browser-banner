// Puts a year picker and Download CSV on Card Kingdom's order and selling
// history pages.
//
// The click walks the list from page 1 (history.js) and saves the chosen
// year's, or the last 30, 90 or 120 days', shipped or completed, paid
// orders. A walk that was refused or cancelled saves no file, and neither
// does one that found no orders.
//
// What a whole walk of a year found is kept (store.js), no orders included,
// so it replaces what was kept before. The next click reads page 1 alone,
// and while page 1 is as it was the kept answer is given at once; the
// button then offers Rebuild, which always reads the list again. A range of
// recent days is never kept: the same range holds other orders tomorrow.

(function (CKB) {
  "use strict";

  var PAGES = {
    "/myaccount/order_history": {
      kind: "purchases",
      every: "Every shipped, paid purchase",
      within: "ordered in",
      none: "No shipped, paid purchases",
      done: "shipped",
      basis: "filed by order date",
    },
    "/myaccount/selling_history": {
      kind: "sales",
      every: "Every completed, paid sale",
      within: "Card Kingdom received in",
      none: "No completed, paid sales",
      done: "completed",
      basis: "filed by the date Card Kingdom received them",
    },
  };

  // The year Card Kingdom opened, so no account's history is out of reach.
  var FIRST_YEAR = 1999;

  // The ranges of recent days offered ahead of the years, as TCGplayer's
  // history offers them.
  var RECENT = [30, 90, 120];

  var page = PAGES[location.pathname.replace(/\/+$/, "")];
  if (!page) {
    return;
  }

  var panel = null;
  var year = null;
  var go = null;
  var generation = 0;
  var store = null;
  // rebuild is set once a kept file was handed out for the chosen year.
  var rebuild = false;

  // chosen is the picker's choice: a year, null for every year, or a number
  // of recent days.
  function chosen() {
    var days = /^days:(\d+)$/.exec(year.value);
    if (days) {
      return { year: null, days: Number(days[1]) };
    }
    return { year: year.value === "all" ? null : Number(year.value), days: null };
  }

  // scope is what a choice covers, as the tooltip says it.
  function scope(c) {
    if (c.days) {
      return " " + page.within + " the last " + c.days + " days";
    }
    return c.year === null ? "" : " " + page.within + " " + c.year;
  }

  function ymd(date) {
    return date.year + "-" + String(date.month).padStart(2, "0") + "-" + String(date.day).padStart(2, "0");
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function idle() {
    rebuild = false;
    go.textContent = "Download CSV";
    panel.word(page.kind);
    panel.clear();
    panel.hint(page.every + scope(chosen()) + ", as a CSV with one row per order");
  }

  function pagesRead(walked) {
    return plural(walked.pages, "page", "pages");
  }

  // recap is what a saved file says about itself on the tooltip: what is in
  // it, how much was read, and what was left out and why.
  function recap(name, picked, walked) {
    var left = [];
    for (var status in picked.skipped) {
      left.push(picked.skipped[status] + " " + status);
    }
    if (picked.unpaid) {
      left.push(picked.unpaid + " unpaid");
    }
    if (picked.otherYears) {
      left.push(picked.otherYears + " from other years");
    }
    if (picked.earlier) {
      left.push(picked.earlier + " from before " + ymd(picked.since));
    }
    return (
      "Saved " + name + ": " + plural(picked.rows.length, "order", "orders") + ", " + page.basis + ". " +
      "Read " + pagesRead(walked) + (left.length ? "; left out " + left.join(", ") : "") + "."
    );
  }

  function clock(ms) {
    var at = new Date(ms);
    return String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
  }

  function none(c) {
    if (c.days) {
      return page.none + " in the last " + c.days + " days";
    }
    return page.none + (c.year === null ? "" : " in " + c.year);
  }

  // fileName names a choice's file. A range of recent days carries the day
  // it was read, since the same range holds other orders tomorrow.
  function fileName(c, today) {
    if (c.days) {
      return "ck-" + page.kind + "-last-" + c.days + "-days-" + ymd(today) + ".csv";
    }
    return "ck-" + page.kind + "-" + (c.year === null ? "all" : c.year) + ".csv";
  }

  // finish saves the walk's file, when it found orders, and answers with
  // what is kept of it: a walk that found none is kept as that answer.
  function finish(walked, c, today, since) {
    var y = c.year;
    var picked = CKB.pick(walked.rows, page.kind, y, since);
    picked.since = since;
    var name = fileName(c, today);
    var file = { name: name, csv: "", count: picked.rows.length, read: pagesRead(walked) };
    if (picked.rows.length) {
      file.csv = CKB.toCSV(picked.rows);
      CKB.download(file.csv, name);
      panel.word(picked.rows.length + " " + page.done);
      panel.mark("done");
      panel.recap(recap(name, picked, walked));
    } else {
      panel.word(page.kind);
      panel.fail(none(c) + "; read " + pagesRead(walked) + ".");
    }
    // Every year's file keeps its rows too, so any one year can be cut from it.
    if (y === null && !c.days) {
      file.rows = picked.rows.map(function (row) {
        return {
          orderID: row.orderID,
          status: row.status,
          orderDate: row.orderDate,
          completedOn: row.completedOn,
          amount: row.amount,
          year: CKB.yearOf(row, page.kind),
        };
      });
    }
    return file;
  }

  // served gives the kept answer for y, and turns the button into Rebuild.
  function served(file, y) {
    var since = " as built at " + clock(file.builtAt) + " from " + file.read +
      ": page 1 has not changed since. Rebuild reads the list again.";
    rebuild = true;
    go.textContent = "Rebuild";
    if (!file.count) {
      panel.word(page.kind);
      panel.fail(none({ year: y, days: null }) + "," + since);
      return;
    }
    CKB.download(file.csv, file.name);
    panel.word(file.count + " " + page.done);
    panel.mark("done");
    panel.recap("Saved " + file.name + " again," + since);
  }

  // cut hands out one year from the kept file of every year, with no walk.
  function cut(all, y) {
    var rows = all.rows.filter(function (row) {
      return row.year === y;
    });
    var built = "the every-year list built at " + clock(all.builtAt);
    rebuild = true;
    go.textContent = "Rebuild";
    if (!rows.length) {
      panel.word(page.kind);
      panel.fail(none({ year: y, days: null }) + ", in " + built + ".");
      return;
    }
    var name = "ck-" + page.kind + "-" + y + ".csv";
    CKB.download(CKB.toCSV(rows), name);
    panel.word(rows.length + " " + page.done);
    panel.mark("done");
    panel.recap("Saved " + name + " from " + built + ": page 1 has not changed since. Rebuild reads the list again.");
  }

  function kept(key) {
    return store
      .then(function (s) {
        return s.get(key);
      })
      .catch(function () {
        return null;
      });
  }

  function run() {
    var mine = ++generation;
    function stale() {
      return mine !== generation;
    }
    var c = chosen();
    var y = c.year;
    var today = CKB.today();
    var since = c.days ? CKB.daysBefore(today, c.days) : null;
    var key = CKB.fileKey(page.kind, y);
    var base = location.origin + location.pathname;
    var force = rebuild;
    var signature = "";
    panel.clear();
    panel.word("reading");
    panel.busy(true);

    CKB.fetchPage(base + "?page=1")
      .then(function (first) {
        if (stale()) {
          return null;
        }
        signature = CKB.historySignature(first, page.kind);
        function walk() {
          return CKB.walkHistory(page.kind, base, {
            year: y,
            since: since,
            first: first,
            cancelled: stale,
            progress: function (n) {
              if (!stale()) {
                panel.word("page " + n);
              }
            },
          });
        }
        // A range of recent days has nothing kept to give.
        if (since) {
          return walk();
        }
        return Promise.all([kept(key), y === null ? null : kept(CKB.fileKey(page.kind, null))])
          .then(function (found) {
            if (stale()) {
              return null;
            }
            // The newer of the year's own answer and the every-year file
            // is given, so neither hides a later read of the list. Both
            // answer for the year by its rule: an every-year file built once
            // the year was over is as final for it as the year's own.
            var now = Date.now();
            var own = !force && CKB.usableFile(found[0], signature, y, now) ? found[0] : null;
            var all = !force && CKB.usableFile(found[1], signature, y, now) && Array.isArray(found[1].rows) ?
              found[1] : null;
            if (all && (!own || all.builtAt > own.builtAt)) {
              panel.busy(false);
              cut(all, y);
              return null;
            }
            if (own) {
              panel.busy(false);
              served(own, y);
              return null;
            }
            return walk();
          });
      })
      .then(function (walked) {
        if (!walked || stale() || walked.cancelled) {
          return;
        }
        panel.busy(false);
        rebuild = false;
        go.textContent = "Download CSV";
        var file = finish(walked, c, today, since);
        if (since) {
          return;
        }
        // A whole walk replaces what is kept, even one that found nothing.
        file.v = CKB.FILE_VERSION;
        file.signature = signature;
        file.builtAt = Date.now();
        store
          .then(function (s) {
            return s.put(key, file);
          })
          .catch(function () {});
      })
      .catch(function (err) {
        if (stale()) {
          return;
        }
        panel.busy(false);
        panel.word(page.kind);
        panel.fail(err && err.message ? err.message : String(err));
      });
  }

  function install() {
    if (document.getElementById("ban-panel")) {
      return;
    }
    panel = CKB.panel();
    store = CKB.openStore();

    year = document.createElement("select");
    year.className = "ban-year";
    year.setAttribute("aria-label", "Range");
    var now = new Date().getFullYear();
    var choices = RECENT.map(function (days) {
      return ["days:" + days, days + " days"];
    });
    choices.push(["all", "All years"]);
    for (var y = now; y >= FIRST_YEAR; y--) {
      choices.push([String(y), String(y)]);
    }
    for (var i = 0; i < choices.length; i++) {
      var option = document.createElement("option");
      option.value = choices[i][0];
      option.textContent = choices[i][1];
      year.appendChild(option);
    }
    year.value = String(now);

    go = document.createElement("button");
    go.type = "button";
    go.className = "ban-go";
    go.textContent = "Download CSV";

    panel.actions.appendChild(year);
    panel.actions.appendChild(go);
    // A page without the table (a sign-in page at this address) gets no panel.
    panel.root.hidden = !document.querySelector("div.orderHistoryWrapper table");
    document.body.appendChild(panel.root);
    idle();

    year.addEventListener("change", idle);
    go.addEventListener("click", run);
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !panel.working()) {
        return;
      }
      generation++;
      panel.busy(false);
      idle();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})(globalThis.CKB);
