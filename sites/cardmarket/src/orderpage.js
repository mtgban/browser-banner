// Saves one of the visitor's own purchases as the offers' CSV, or sends it
// to BAN (SPECIFICATIONS.md, section 8).
//
// The order page lists every article it holds, so there is nothing to walk:
// the rows are read off the page as it stands, and the one request is the
// exchange rate, made on the click.

globalThis.MKM = globalThis.MKM || {};

(function (MKM) {
  "use strict";

  // /<language>/<Game>/Orders/<id>: an order, of the game it is filed under.
  var path = /^\/[a-z]{2}\/([^/]+)\/Orders\/(\d+)\/?$/.exec(location.pathname);
  if (!path) {
    return;
  }
  var game = path[1].toLowerCase();
  var id = path[2];

  var read = MKM.parsePurchase(document);
  if (!read.cards.length && !read.skipped) {
    return;
  }

  var panel = MKM.panel();
  var working = false;

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  // rows converts the prices and writes the file, { csv, rows, unpriced }.
  function rows() {
    return MKM.fetchRates().then(function (rates) {
      var unpriced = 0;
      for (var i = 0; i < read.cards.length; i++) {
        read.cards[i].priceUSD = MKM.priceUSD(read.cards[i].price, read.cards[i].currency, rates);
        if (!read.cards[i].priceUSD) {
          unpriced++;
        }
      }
      return { csv: MKM.toCSV(read.cards), rows: read.cards.length, unpriced: unpriced };
    });
  }

  // recap says what went and what did not.
  function recap(what, done) {
    var left = [];
    if (read.skipped) {
      left.push(plural(read.skipped, "article", "articles") + " left out: altered, signed, inked or unreadable");
    }
    if (done.unpriced) {
      left.push(plural(done.unpriced, "price", "prices") + " left empty: no exchange rate");
    }
    panel.mark("done");
    panel.recap(what + (left.length ? "; " + left.join("; ") : ""));
  }

  function save() {
    if (working) {
      return;
    }
    working = true;
    panel.clear();
    panel.busy(true);
    rows().then(function (done) {
      working = false;
      panel.busy(false);
      var name = "cm-purchase-" + id + ".csv";
      MKM.download(done.csv, name);
      recap("Saved " + name, done);
    });
  }

  // send hands the rows CSV would save to mtgban's upload. window.open needs
  // the click, so the tab opens at once and the rows follow it.
  function send() {
    if (working) {
      return;
    }
    var done = null;
    panel.clear();
    panel.recap("Waiting for mtgban's upload page to take the order");
    MKM.handOff(
      game,
      rows().then(function (written) {
        done = written;
        return { csv: written.csv, rows: written.rows };
      }),
      function (said) {
        if (said === null || said === MKM.REPLACED) {
          return;
        }
        if (said) {
          panel.fail(said);
          return;
        }
        recap("Sent " + plural(read.cards.length, "article", "articles") + " to BAN", done);
      }
    );
  }

  function button(className, text, onClick) {
    var made = document.createElement("button");
    made.type = "button";
    made.className = className;
    made.textContent = text;
    made.addEventListener("click", onClick);
    panel.actions.appendChild(made);
    return made;
  }

  var copies = 0;
  for (var i = 0; i < read.cards.length; i++) {
    copies += Number(read.cards[i].quantity);
  }
  panel.word(plural(copies, "card", "cards"));
  panel.hint("Save this order's " + plural(read.cards.length, "article", "articles") + " as CSV, or send them to BAN");
  button("ban-send", "Send to BAN", send).disabled = !MKM.handoffURL(game) || !read.cards.length;
  button("ban-save", "CSV", save).disabled = !read.cards.length;
  document.body.appendChild(panel.root);
})(globalThis.MKM);
