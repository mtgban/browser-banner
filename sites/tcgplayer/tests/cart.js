// Stands TCGplayer's cart up as far as BANner meets it: the page from the
// fixture, the cart key in its cookie, and TCGplayer's cart API behind
// mpgateway, which the extension asks and does not own:
//
// - validatecart answers with the cart's items, which carry no names;
// - bulkdelete takes items out by cartItemId, unless told to refuse, and
//   answers with no body;
// - bulkadd adds a listing back under a new cartItemId, at the seller's
//   price now, unless the listing is sold out or the add is refused;
// - mp-search-api's getProductForSkus names cards by sku, unless told not to.
//
// Every request is recorded with the time it went, and a reload is counted
// rather than done.

import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { clock } from "../../../tests/clock.js";
import { siteManifest } from "../../../tests/manifest.js";

const SITE = "https://www.tcgplayer.com";
export const KEY = "5c4c773f372945139271f4fab1f1572e";
const GATEWAY = "https://mpgateway.tcgplayer.com/v1/cart/" + KEY + "/";
const CATALOGUE = "https://mp-search-api.tcgplayer.com/v1/product/getProductForSkus";

// ITEMS is the cart as the fixture draws it, in validatecart's shape: an
// item Direct ships is in Direct's package, whoever sells it.
const item = (cartItemId, sku, sellerId, sellerKey, quantity, currentPrice, isDirect) => ({
  cartItemId, sku, sellerId, sellerKey, quantity, currentPrice, savedPrice: currentPrice, isDirect,
  customListingKey: null, giftCardKey: null, isConsignment: false, isSYP: false, status: "CAPI-0",
});
export const ITEMS = [
  item(101, 1001, 11, "0a1b2c3d", 2, 0.5, false),
  item(102, 1002, 11, "0a1b2c3d", 1, 0.25, false),
  item(103, 1003, 22, "4e5f6a7b", 1, 2, false),
  item(104, 1004, 33, "8c9d0e1f", 1, 1, true),
];

// CARDS is the catalogue, by sku.
export const CARDS = {
  1001: { productName: "Llanowar Elves", condition: "Near Mint" },
  1002: { productName: "Giant Growth", condition: "Lightly Played" },
  1003: { productName: "Counterspell", condition: "Near Mint Foil" },
  1004: { productName: "Lightning Bolt", condition: "Near Mint" },
};
export const nameOf = (i) => (CARDS[i.sku] ? CARDS[i.sku].productName : i.productName);

export function mountCart({ path = "/cart", items = ITEMS, cookie = "StoreCart_PRODUCTION=CK%3D" + KEY + "%26Ignore%3Dfalse", stash, said, refuseDelete = false, keep = [], refuseAdd = false, soldOut = [], priceNow = {}, unnamed = false } = {}) {
  const window = new Window({
    url: SITE + path,
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true },
  });
  const time = clock(window);
  const doc = window.document;
  doc.body.innerHTML = readFileSync(new URL("fixtures/cart.html", import.meta.url), "utf8");
  if (cookie) doc.cookie = cookie;
  if (stash) window.localStorage.setItem("banner-tcgplayer-stash", JSON.stringify(stash));
  if (said) window.sessionStorage.setItem("banner-tcgplayer-said", JSON.stringify(said));

  let cart = items.map((i) => ({ ...i }));
  let next = 500;
  const asked = [];
  const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(body === null ? "" : JSON.stringify(body)) });
  window.fetch = (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    asked.push({ at: window.Date.now(), method: init.method, path: u.replace(GATEWAY, "").replace(CATALOGUE, "getProductForSkus"), body, credentials: init.credentials });
    if (u === CATALOGUE && init.method === "POST") {
      if (unnamed) return Promise.resolve(json(503, {}));
      return Promise.resolve(json(200, { errors: [], results: [body.filter((sku) => CARDS[sku]).map((sku) => ({ sku, ...CARDS[sku], setName: "Test Set" }))] }));
    }
    if (!u.startsWith(GATEWAY)) return Promise.resolve(json(404, {}));
    const what = u.slice(GATEWAY.length).replace(/\?.*$/, "");
    if (what === "validatecart" && init.method === "POST") {
      return Promise.resolve(json(200, { errors: [], results: [{ cartItems: cart.map((i) => ({ ...i })), saveForLaterItems: [] }] }));
    }
    if (what === "items/bulkdelete" && init.method === "DELETE") {
      if (refuseDelete) return Promise.resolve(json(500, {}));
      cart = cart.filter((i) => !body.items.includes(i.cartItemId) || keep.includes(nameOf(i)));
      return Promise.resolve(json(200, null));
    }
    if (what === "items/bulkadd" && init.method === "POST") {
      if (refuseAdd) return Promise.resolve(json(500, {}));
      for (const add of body.items) {
        const was = ITEMS.find((i) => i.sku === add.sku && i.sellerId === add.sellerId);
        if (!was || soldOut.includes(nameOf(was))) continue;
        cart.push({ ...was, cartItemId: ++next, quantity: add.requestedQuantity, currentPrice: priceNow[nameOf(was)] ?? add.price });
      }
      return Promise.resolve(json(200, { errors: [], results: [{ items: [] }] }));
    }
    return Promise.resolve(json(404, {}));
  };

  for (const entry of siteManifest("tcgplayer").content_scripts) {
    if (!entry.matches.includes("https://www.tcgplayer.com/*")) continue;
    for (const script of entry.js) {
      window.eval(readFileSync(new URL("../" + script, import.meta.url), "utf8"));
    }
  }
  let reloads = 0;
  window.TCGB.reload = () => reloads++;
  window.TCGB.PACE = 100;

  const panel = () => doc.getElementById("ban-panel");
  const at = (s) => panel() && panel().querySelector(s);
  const pkg = (name) => doc.querySelector('[data-testid="packageContainerFor-' + name + '"]');
  return {
    window,
    doc,
    asked,
    cart: () => cart.map(nameOf),
    reloads: () => reloads,
    shown: () => panel() !== null,
    word: () => at(".ban-word").textContent,
    tip: () => at(".ban-tip").textContent,
    back: () => at(".ban-go"),
    busy: () => panel().classList.contains("ban-busy"),
    failed: () => !at(".ban-mark").hidden && at(".ban-mark").classList.contains("ban-failed"),
    done: () => !at(".ban-mark").hidden && !at(".ban-mark").classList.contains("ban-failed"),
    buttons: () => doc.querySelectorAll(".ban-only").length,
    only: (name) => pkg(name).querySelector(".ban-only"),
    press: (name) => pkg(name).querySelector(".ban-only").click(),
    stash: () => JSON.parse(window.localStorage.getItem("banner-tcgplayer-stash") || "null"),
    said: () => JSON.parse(window.sessionStorage.getItem("banner-tcgplayer-said") || "null"),
    visit: (to) => window.history.pushState({}, "", SITE + to),
    idle: () => time.until(() => !panel().classList.contains("ban-busy")),
    settle: (ms = 60) => time.settle(ms),
  };
}
