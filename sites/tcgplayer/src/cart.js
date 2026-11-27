// The cart (SPECIFICATIONS.md, section 12): its packages read off the page,
// its items read from TCGplayer's own cart API, and Only this seller's
// set-aside list kept beside them.
//
// TCGplayer's cart page asks mpgateway for the cart by the key in its
// StoreCart_PRODUCTION cookie, and so does this, one request at a time and
// with the visitor's own session. Its Save for later keeps a card but not
// its seller, so the items set aside are taken out of the cart and put back
// the way TCGplayer's own undo of a removed package does: each listing
// added again by its seller and price.

globalThis.TCGB = globalThis.TCGB || {};

(function (TCGB) {
  "use strict";

  var GATEWAY = "https://mpgateway.tcgplayer.com/v1/cart/";
  var PRODUCTS = "https://mp-search-api.tcgplayer.com/v1/product/getProductForSkus";
  TCGB.STASH_KEY = "banner-tcgplayer-stash";
  TCGB.NO_CART = "TCGplayer's cart could not be found; reload the page";

  var net = TCGB.net;

  // send asks the gateway, as the page would: Firefox gives a content
  // script's own fetch the extension's origin, and its content.fetch the
  // page's.
  function send(url, init) {
    var go = typeof content !== "undefined" && content && content.fetch ? content.fetch.bind(content) : fetch;
    var options = { credentials: "include", signal: net.deadline() };
    for (var k in init) {
      options[k] = init[k];
    }
    return go(url, options)
      .then(net.check)
      // bulkdelete answers with no body at all.
      .then(function (response) {
        return response.text();
      })
      .then(function (text) {
        return text ? JSON.parse(text) : {};
      })
      .then(function (body) {
        var errors = body && body.errors;
        if (errors && errors.length) {
          throw new Error("TCGplayer answered " + (errors[0].code || errors[0].message || "an error"));
        }
        return body;
      })
      .catch(net.timedOut);
  }

  // cartKey is the cart TCGplayer's page shows, from its cookie, or "".
  TCGB.cartKey = function (cookie) {
    var line = String(cookie || "").split(/;\s*/).filter(function (c) {
      return c.indexOf("StoreCart_PRODUCTION=") === 0;
    })[0];
    var key = line ? /(?:^|[=&])CK=([0-9a-f]{32})(?:&|$)/i.exec(decodeURIComponent(line.slice(21))) : null;
    return key ? key[1] : "";
  };

  // readCart answers with the cart's items as TCGplayer validates them for
  // its page: { cartItemId, sku, sellerId, sellerKey, quantity, currentPrice,
  // isDirect, customListingKey, giftCardKey, ... }, with no names.
  TCGB.readCart = function (key) {
    return send(GATEWAY + key + "/validatecart?validateForCheckout=false&countryCode=US", { method: "POST" }).then(function (body) {
      var got = body && body.results && body.results[0];
      if (!got || !Array.isArray(got.cartItems)) {
        throw new Error("TCGplayer's cart could not be read");
      }
      return got.cartItems;
    });
  };

  // removeItems takes cart items out by their cartItemId.
  TCGB.removeItems = function (key, ids) {
    return send(GATEWAY + key + "/items/bulkdelete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: ids }),
    });
  };

  // addItems adds set-aside listings back, each from its own seller at the
  // price it was set aside at, as TCGplayer's undo of a removed package does.
  TCGB.addItems = function (key, kept) {
    return send(GATEWAY + key + "/items/bulkadd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: kept.map(function (s) {
          return {
            sku: s.sku,
            sellerId: s.sellerId,
            channelId: 0,
            requestedQuantity: s.quantity,
            price: s.price,
            isDirect: s.isDirect,
            customListingKey: s.customListingKey || null,
          };
        }),
      }),
    });
  };

  // productNames answers { sku: "name (condition)" } for the skus asked,
  // from the catalogue TCGplayer's page names its cart's cards from.
  TCGB.productNames = function (skus) {
    return send(PRODUCTS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skus),
    }).then(function (body) {
      var names = {};
      ((body && body.results && body.results[0]) || []).forEach(function (p) {
        if (p && p.sku && p.productName) {
          names[p.sku] = p.productName + (p.condition ? " (" + p.condition + ")" : "");
        }
      });
      return names;
    });
  };

  // packageOf is which package of the page an item is in, as TCGplayer's
  // page sorts them: "direct" for every item Direct ships, otherwise its
  // seller's key.
  TCGB.packageOf = function (item) {
    return item.isDirect ? "direct" : item.sellerKey;
  };

  // packages reads the cart page's packages: { key, name, actions }, key as
  // packageOf names it and actions the row of Remove all items and Save all
  // items. The name is the package's test id's, since Direct's heading also
  // holds its tooltip. A gift card's package is left out.
  TCGB.packages = function (doc) {
    var found = [];
    var boxes = doc.querySelectorAll('[data-testid="directPackage"], [data-testid^="nonDirectPackage-"]');
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute("data-testid");
      var article = boxes[i].closest("article");
      var actions = boxes[i].querySelector(".all-items-actions");
      var title = article ? (article.getAttribute("data-testid") || "").replace(/^packageContainerFor-/, "") : "";
      if (!actions) {
        continue;
      }
      found.push({
        key: id === "directPackage" ? "direct" : id.slice("nonDirectPackage-".length),
        name: title || (id === "directPackage" ? "TCGplayer Direct" : ""),
        actions: actions,
      });
    }
    return found;
  };

  // kept is what a cart item is set aside as, sellers naming each package
  // by its key as the page heads it.
  TCGB.kept = function (item, sellers) {
    return {
      sku: item.sku,
      sellerId: item.sellerId,
      sellerKey: item.sellerKey,
      sellerName: sellers[TCGB.packageOf(item)] || "",
      quantity: item.quantity,
      price: item.currentPrice,
      isDirect: !!item.isDirect,
      customListingKey: item.customListingKey || null,
    };
  };

  // holds says whether the cart holds a set-aside listing again: its card
  // from its seller, at least as many.
  TCGB.holds = function (items, s) {
    var n = 0;
    items.forEach(function (item) {
      if (item.sku === s.sku && item.sellerKey === s.sellerKey) {
        n += item.quantity;
      }
    });
    return n >= s.quantity;
  };

  // same says whether two set-aside entries are one listing.
  function same(a, b) {
    return a.sku === b.sku && a.sellerKey === b.sellerKey && a.isDirect === b.isDirect &&
      (a.customListingKey || null) === (b.customListingKey || null);
  }

  // setAside adds a kept listing to the stash, onto its entry if the stash
  // has one, at the price it was set aside at now.
  TCGB.setAside = function (stash, kept) {
    var had = stash.items.filter(function (s) {
      return same(s, kept);
    })[0];
    if (!had) {
      stash.items.push(kept);
      return;
    }
    had.quantity += kept.quantity;
    had.price = kept.price;
    had.sellerName = kept.sellerName || had.sellerName;
  };

  // unsetAside takes a kept listing off the stash again, as many as it was.
  TCGB.unsetAside = function (stash, kept) {
    stash.items = stash.items.filter(function (s) {
      if (!same(s, kept)) {
        return true;
      }
      s.quantity -= kept.quantity;
      return s.quantity > 0;
    });
  };

  // stash is what Only this seller set aside, { items: [kept] }, in
  // TCGplayer's own localStorage.
  TCGB.stash = function () {
    try {
      var kept = JSON.parse(localStorage.getItem(TCGB.STASH_KEY));
      return kept && Array.isArray(kept.items) ? kept : { items: [] };
    } catch (err) {
      return { items: [] };
    }
  };

  TCGB.keepStash = function (stash) {
    if (stash.items.length) {
      localStorage.setItem(TCGB.STASH_KEY, JSON.stringify(stash));
    } else {
      localStorage.removeItem(TCGB.STASH_KEY);
    }
  };
})(globalThis.TCGB);
