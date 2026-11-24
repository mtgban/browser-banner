// The cart (SPECIFICATIONS.md, section 5): its sellers read off the page,
// an item taken out through its own quantity list, and listings put back.
//
// ManaPool keeps the cart in localStorage as seller listings and syncs it
// to its server itself. The page never shows a listing's id, so taking an
// item out is how its id is learned: the stored cart loses that listing.
// Putting one back is a change written into the stored cart and announced
// as another tab's write would be; the page syncs it while it has focus.

globalThis.MPB = globalThis.MPB || {};

(function (MPB) {
  "use strict";

  MPB.CART_KEY = "manapool-cart";
  MPB.STASH_KEY = "banner-manapool-stash";
  // TICK is how often a removal looks for ManaPool's answer, which takes a
  // few milliseconds; OPEN is how long a quantity list gets to open, WAIT how
  // long ManaPool gets to answer each change, and LEAVE how long it gets to
  // draw the items taken out off the page.
  MPB.TICK = 5;
  MPB.OPEN = 1000;
  MPB.WAIT = 3000;
  MPB.LEAVE = 1000;
  // SYNC is how long Put back waits for ManaPool to sync what it wrote.
  MPB.SYNC = 15000;

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  // waitFor polls test until it answers something, or ms run out.
  MPB.waitFor = waitFor;
  function waitFor(test, ms, every) {
    var until = Date.now() + ms;
    return new Promise(function (done) {
      (function poll() {
        var got = test();
        if (got || Date.now() >= until) {
          done(got || null);
          return;
        }
        setTimeout(poll, every || 50);
      })();
    });
  }

  // stored is ManaPool's stored cart, or null when it cannot be read.
  MPB.stored = function () {
    try {
      var cart = JSON.parse(localStorage.getItem(MPB.CART_KEY));
      return cart && cart.cart && Array.isArray(cart.cart.entries) && Array.isArray(cart.changes) ? cart : null;
    } catch (err) {
      return null;
    }
  };

  // headerOf is the row across a seller's section, the name at its left and
  // its right empty, or the name's own box where the page draws no such row.
  function headerOf(section, named) {
    var row = named.closest(".justify-between");
    return row && section.contains(row) ? row : named.closest("h3").parentElement;
  }

  // sellers reads the cart page's sections: { slug, name, header, items }
  // for each list of items under one seller's links, header being the row
  // that holds the seller's name.
  MPB.sellers = function (doc) {
    var found = [];
    var lists = doc.querySelectorAll("ul");
    for (var i = 0; i < lists.length; i++) {
      var items = [];
      for (var j = 0; j < lists[i].children.length; j++) {
        var li = lists[i].children[j];
        if (li.tagName === "LI" && li.querySelector('[aria-label="Update Quantity"]')) {
          items.push(li);
        }
      }
      if (!items.length) {
        continue;
      }
      var section = lists[i].parentElement;
      var hrefs = [];
      while (section) {
        hrefs = [];
        var links = section.querySelectorAll('a[href*="/shop/"]');
        for (var k = 0; k < links.length; k++) {
          if (hrefs.indexOf(links[k].getAttribute("href")) < 0) {
            hrefs.push(links[k].getAttribute("href"));
          }
        }
        if (hrefs.length) {
          break;
        }
        section = section.parentElement;
      }
      var named = section && hrefs.length === 1 ? section.querySelector('h3 a[href*="/shop/"]') : null;
      if (!named) {
        continue;
      }
      found.push({
        slug: hrefs[0].replace(/^.*\/shop\//, "").replace(/[/?#].*$/, ""),
        name: text(named),
        header: headerOf(section, named),
        items: items,
      });
    }
    return found;
  };

  // itemOf is what an item says of itself, to name it later.
  MPB.itemOf = function (li) {
    var tags = li.querySelectorAll("h3 + div span");
    return {
      name: text(li.querySelector("h3")),
      set: text(li.querySelector("h3 + div p")),
      tags: Array.prototype.map.call(tags, text).join(" "),
    };
  };

  // key presses a key on el as a person would. MPB.keying is set while it
  // does, so the panel's own Escape does not take it for the person's.
  function key(el, name) {
    MPB.keying = true;
    try {
      ["keydown", "keyup"].forEach(function (type) {
        el.dispatchEvent(new KeyboardEvent(type, { key: name, code: name, bubbles: true, cancelable: true }));
      });
    } finally {
      MPB.keying = false;
    }
  }

  // removeItem takes one item out through its quantity list, as a person
  // would by keyboard, and answers with the stored listings it took: one,
  // with its quantity.
  MPB.removeItem = function (li) {
    var before = MPB.stored();
    var box = li.querySelector('[aria-label="Update Quantity"]');
    if (!before || !box) {
      return Promise.reject(new Error("ManaPool's cart could not be read"));
    }
    box.focus();
    key(box, "ArrowDown");
    return waitFor(function () {
      // This box's own list: an item just taken out leaves its list on the
      // page for a moment, open beside this one.
      var list = box.ownerDocument.getElementById(box.getAttribute("aria-controls") || "");
      return list && list.querySelector('[role="option"][data-value="0"][data-highlighted]');
    }, MPB.OPEN, MPB.TICK)
      .then(function (remove) {
        if (!remove) {
          key(box, "Escape");
          throw new Error("ManaPool offered no remove for " + MPB.itemOf(li).name);
        }
        key(box, "Enter");
        return waitFor(function () {
          var after = MPB.stored();
          var gone = after ? before.cart.entries.filter(function (e) {
            return !after.cart.entries.some(function (a) {
              return a.inventoryId === e.inventoryId;
            });
          }) : [];
          return gone.length ? gone : null;
        }, MPB.WAIT, MPB.TICK);
      })
      .then(function (gone) {
        if (!gone || gone.length !== 1) {
          throw new Error("ManaPool did not take out " + MPB.itemOf(li).name);
        }
        return gone;
      });
  };

  // removeAll takes items out one at a time, each as soon as ManaPool has
  // answered the last, calling took(li, gone) after each; going() answers
  // false to stop. It ends once the page has drawn them off.
  MPB.removeAll = function (items, took, going) {
    var i = 0;
    function next() {
      if (i >= items.length || !going()) {
        return waitFor(function () {
          return !items.slice(0, i).some(function (li) {
            return li.isConnected;
          });
        }, MPB.LEAVE);
      }
      var li = items[i++];
      return MPB.removeItem(li).then(function (gone) {
        took(li, gone);
        return next();
      });
    }
    return next();
  };

  // stash is what Only this seller set aside: { items: [{ entry, seller,
  // item }] }, kept in ManaPool's own localStorage beside the cart.
  MPB.stash = function () {
    try {
      var kept = JSON.parse(localStorage.getItem(MPB.STASH_KEY));
      return kept && Array.isArray(kept.items) ? kept : { items: [] };
    } catch (err) {
      return { items: [] };
    }
  };

  MPB.keepStash = function (stash) {
    if (stash.items.length) {
      localStorage.setItem(MPB.STASH_KEY, JSON.stringify(stash));
    } else {
      localStorage.removeItem(MPB.STASH_KEY);
    }
  };

  // putBack writes the stashed listings into the stored cart as changes,
  // as ManaPool's own add does, and announces the write; answers with the
  // ones it wrote, leaving out any the cart already holds.
  MPB.putBack = function (items) {
    var cart = MPB.stored();
    if (!cart) {
      throw new Error("ManaPool's cart could not be read");
    }
    var added = items.filter(function (s) {
      return !cart.cart.entries.some(function (e) {
        return e.inventoryId === s.entry.inventoryId;
      });
    });
    var next = {
      version: cart.version,
      revision: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      cart: { entries: cart.cart.entries.concat(added.map(function (s) { return s.entry; })) },
      changes: cart.changes.concat(added.map(function (s) {
        return [s.entry.inventoryId, s.entry.quantitySelected, s.entry.source || null, !!s.entry.optimizerTouched];
      })),
    };
    var oldValue = localStorage.getItem(MPB.CART_KEY);
    var newValue = JSON.stringify(next);
    localStorage.setItem(MPB.CART_KEY, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key: MPB.CART_KEY, oldValue: oldValue, newValue: newValue }));
    return added;
  };
})(globalThis.MPB);
