// Saves a sell invoice's cards as CSV and sends them to mtgban's upload
// (SPECIFICATIONS.md, section 17).
//
// The invoice names no product, so each line's Scryfall id comes from the
// price list, found by its edition, name and foil: read on a click and kept
// for an hour, the same list the carts use. CSV and BAN are greyed out until
// a list is in hand, so the rows always carry the ids the list gives them.

(function (CKB) {
  "use strict";

  var id = /^\/myaccount\/po_invoice\/(\d+)\/?$/.exec(location.pathname);
  if (!id) {
    return;
  }

  var panel = null;
  var csv = null;
  var ban = null;
  var list = null;
  var reading = null;
  var store = CKB.openStore();

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function read() {
    return CKB.readSellInvoice(document) || { lines: [], unreadable: 0 };
  }

  // say puts how the invoice stands against the list in the tooltip: how
  // many lines it found, and what it did not.
  function say(invoice) {
    var found = 0;
    for (var i = 0; i < invoice.lines.length; i++) {
      if (CKB.invoiceRow(invoice.lines[i], list)) {
        found++;
      }
    }
    var left = [];
    if (found < invoice.lines.length) {
      left.push(plural(invoice.lines.length - found, "line", "lines") + " not in the price list, with no Scryfall id");
    }
    if (invoice.unreadable) {
      left.push(plural(invoice.unreadable, "line", "lines") + " unreadable, left out");
    }
    panel.word(plural(invoice.lines.length, "line", "lines"));
    panel.mark("done");
    panel.recap(found + " of " + plural(invoice.lines.length, "line", "lines") + " found in the price list" +
      (left.length ? "; " + left.join("; ") : ""));
  }

  // ready shows the invoice against the list now in hand.
  function ready() {
    csv.disabled = false;
    ban.disabled = false;
    say(read());
  }

  function idle() {
    csv.disabled = true;
    ban.disabled = true;
    panel.word("");
    panel.clear();
    panel.hint("Give this order's cards their Scryfall ids from Card Kingdom's price list, read once and kept for an hour");
  }

  function check() {
    var controller = new AbortController();
    reading = controller;
    panel.clear();
    panel.word("fetching API");
    panel.busy(true);
    CKB.fetchList({ signal: controller.signal })
      .then(function (fetched) {
        if (reading !== controller) {
          return null;
        }
        reading = null;
        list = fetched;
        panel.busy(false);
        ready();
        return store.then(function (s) {
          return CKB.keepList(s, fetched);
        });
      })
      .catch(function (err) {
        // A read Escape cancelled has nothing to say.
        if (reading !== controller) {
          return;
        }
        reading = null;
        panel.busy(false);
        if (list) {
          ready();
        } else {
          idle();
        }
        panel.fail(err && err.message ? err.message : String(err));
      });
  }

  function cancel() {
    if (!reading) {
      return;
    }
    reading.abort();
    reading = null;
    panel.busy(false);
    if (list) {
      ready();
    } else {
      idle();
    }
  }

  // saveCSV writes the invoice's lines with their ids from the list in hand.
  function saveCSV() {
    if (reading || !list) {
      return;
    }
    CKB.download(CKB.invoiceCSV(read().lines, list), "ck-sale-" + id[1] + ".csv");
  }

  // sendToBan hands the rows CSV would save to mtgban's upload, Magic's, in
  // a tab of its own. It runs straight from the click: window.open needs
  // one.
  function sendToBan() {
    if (reading || !list) {
      return;
    }
    var lines = read().lines;
    panel.clear();
    panel.recap("Waiting for mtgban's upload page to take the order");
    CKB.handOff("magic", CKB.invoiceCSV(lines, list), lines.length, function (error) {
      // The later send speaks for itself.
      if (error === CKB.REPLACED) {
        return;
      }
      if (error) {
        panel.fail(error);
        return;
      }
      panel.mark("done");
      panel.recap("Sent " + plural(lines.length, "line", "lines") + " to BAN");
    });
  }

  function button(className, text, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", onClick);
    panel.actions.appendChild(b);
    return b;
  }

  function install() {
    var invoice = CKB.readSellInvoice(document);
    if (document.getElementById("ban-panel") || !invoice || !(invoice.lines.length || invoice.unreadable)) {
      return;
    }
    panel = CKB.panel();
    button("ban-go", "Load prices", check);
    csv = button("ban-go ban-csv", "CSV", saveCSV);
    ban = button("ban-go ban-send", "BAN", sendToBan);
    ban.setAttribute("aria-label", "Send to BAN");
    document.body.appendChild(panel.root);
    idle();
    store
      .then(function (s) {
        return CKB.keptList(s, Date.now()).then(function (kept) {
          if (kept && !list && !reading) {
            list = kept;
            ready();
          }
        });
      })
      .catch(function () {});
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        cancel();
      }
    });
  }

  install();
})(globalThis.CKB);
