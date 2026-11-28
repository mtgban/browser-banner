// The cart: Only this seller beside each package's own actions, and Put
// back on the panel, both through TCGplayer's cart API.

import { test, expect, describe } from "bun:test";
import { mountCart, ITEMS, CARDS, nameOf } from "./cart.js";

// SELLERS is what the page heads each package.
const SELLERS = { "0a1b2c3d": "Seller A", "4e5f6a7b": "Seller B", direct: "TCGplayer Direct" };
const kept = (names) => ITEMS.filter((i) => names.includes(nameOf(i)));
const stashOf = (names) => ({
  items: kept(names).map((i) => ({
    sku: i.sku,
    sellerId: i.sellerId,
    sellerKey: i.sellerKey,
    sellerName: SELLERS[i.isDirect ? "direct" : i.sellerKey],
    quantity: i.quantity,
    price: i.currentPrice,
    isDirect: i.isDirect,
    customListingKey: null,
  })),
});
const stashed = (it) => it.stash().items.map((s) => CARDS[s.sku].productName);
const SET_ASIDE = ["Llanowar Elves", "Giant Growth", "Lightning Bolt"];

describe("the cart", () => {
  test("puts Only this seller in a row above each package's Remove all items and Save all items, and back after a redraw", async () => {
    const it = mountCart();
    expect(it.buttons()).toBe(3);
    for (const b of it.doc.querySelectorAll(".ban-only")) {
      expect(b.textContent).toBe("Only this seller");
      expect(b.parentElement.className).toBe("ban-row");
      expect(b.parentElement.firstElementChild).toBe(b);
      expect([...b.parentElement.nextElementSibling.children].map((c) => c.textContent)).toEqual(["Remove all items", "Save all items"]);
    }
    it.only("Seller A").parentElement.remove();
    await it.settle(600);
    expect(it.buttons()).toBe(3);
    expect(it.back().disabled).toBe(true);
    expect(it.tip()).toBe("Beside each seller: Only this seller, to set the others aside; beside Direct: Consolidate");
    expect(it.asked).toEqual([]);
  });

  test("shows on the cart alone, and leaves with it", async () => {
    const it = mountCart({ path: "/product/1/x" });
    expect(it.shown()).toBe(false);
    expect(it.buttons()).toBe(0);
    it.visit("/cart");
    await it.settle(600);
    expect(it.shown()).toBe(true);
    expect(it.buttons()).toBe(3);
    it.visit("/search/all/product");
    await it.settle(600);
    expect(it.shown()).toBe(false);
    expect(it.buttons()).toBe(0);
  });

  test("Only this seller takes every other package's items out, and keeps each with its seller and price", async () => {
    const it = mountCart();
    it.press("Seller B");
    await it.idle();
    expect(it.cart()).toEqual(["Counterspell"]);
    expect(it.stash()).toEqual(stashOf(SET_ASIDE));
    expect(it.asked.map((a) => a.method + " " + a.path.replace(/\?.*$/, ""))).toEqual([
      "POST validatecart",
      "DELETE items/bulkdelete",
      "POST validatecart",
    ]);
    expect(it.asked[0].path).toBe("validatecart?validateForCheckout=false&countryCode=US");
    expect(it.asked[1].body).toEqual({ items: [101, 102, 104] });
    expect(it.tip()).toBe("Set aside 3 items from 2 other sellers; only Seller B is left to check out");
    expect(it.done()).toBe(true);
    expect(it.reloads()).toBe(1);
    expect(it.said()).toEqual({ text: "Set aside 3 items from 2 other sellers; only Seller B is left to check out", failed: false });
  });

  test("asks one request at a time, a pace apart, with the visitor's session", async () => {
    const it = mountCart();
    it.press("Seller B");
    await it.idle();
    for (let i = 1; i < it.asked.length; i++) {
      expect(it.asked[i].at - it.asked[i - 1].at).toBeGreaterThanOrEqual(100);
    }
    expect(it.asked.every((a) => a.credentials === "include")).toBe(true);
  });

  test("TCGplayer Direct's package keeps the items Direct ships, and no other seller's", async () => {
    const it = mountCart();
    it.press("TCGplayer Direct");
    await it.idle();
    expect(it.cart()).toEqual(["Lightning Bolt"]);
    expect(stashed(it)).toEqual(["Llanowar Elves", "Giant Growth", "Counterspell"]);
    expect(it.stash().items.map((s) => s.sellerName)).toEqual(["Seller A", "Seller A", "Seller B"]);
    expect(it.tip()).toBe("Set aside 3 items from 2 other sellers; only TCGplayer Direct is left to check out");
  });

  test("a gift card stays in the cart", async () => {
    const it = mountCart({ items: [...ITEMS, { cartItemId: 105, giftCardKey: "gc-1", productName: "Gift Card", quantity: 1, currentPrice: 25 }] });
    it.press("Seller B");
    await it.idle();
    expect(it.cart()).toEqual(["Counterspell", "Gift Card"]);
    expect(it.asked[1].body).toEqual({ items: [101, 102, 104] });
  });

  test("a package alone in the cart sets nothing aside and leaves the page as it is", async () => {
    const it = mountCart({ items: kept(["Counterspell"]) });
    it.press("Seller B");
    await it.idle();
    expect(it.asked.length).toBe(1);
    expect(it.tip()).toBe("Only Seller B is in the cart");
    expect(it.stash()).toBe(null);
    expect(it.reloads()).toBe(0);
  });

  test("a refused removal keeps nothing aside, says so, and leaves the page as it is", async () => {
    const it = mountCart({ refuseDelete: true });
    it.press("Seller B");
    await it.idle();
    expect(it.cart().length).toBe(4);
    expect(it.stash()).toBe(null);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("TCGplayer answered 500; 0 in stash");
    expect(it.reloads()).toBe(0);
  });

  test("an item TCGplayer keeps in the cart is not kept aside too", async () => {
    const it = mountCart({ keep: ["Giant Growth"] });
    it.press("Seller B");
    await it.idle();
    expect(it.cart()).toEqual(["Giant Growth", "Counterspell"]);
    expect(stashed(it)).toEqual(["Llanowar Elves", "Lightning Bolt"]);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("TCGplayer kept 1 item in the cart; 2 in stash");
    expect(it.reloads()).toBe(1);
  });

  test("a second Only this seller adds to what is set aside", async () => {
    const it = mountCart({ items: kept(["Counterspell", "Lightning Bolt"]), stash: stashOf(["Llanowar Elves", "Giant Growth"]) });
    it.press("Seller B");
    await it.idle();
    expect(it.stash()).toEqual(stashOf(SET_ASIDE));
    expect(it.word()).toBe("3 in stash");
  });

  test("a listing set aside earlier and back in the cart is no longer set aside, nor counted as kept", async () => {
    const it = mountCart({ items: kept(["Llanowar Elves", "Counterspell", "Lightning Bolt"]), stash: stashOf(["Llanowar Elves", "Giant Growth"]) });
    it.press("Seller A");
    await it.idle();
    expect(it.cart()).toEqual(["Llanowar Elves"]);
    expect(stashed(it)).toEqual(["Giant Growth", "Counterspell", "Lightning Bolt"]);
    expect(it.done()).toBe(true);
    expect(it.tip()).toBe("Set aside 2 items from 2 other sellers; only Seller A is left to check out");
  });

  test("the same card from the package kept does not count as one TCGplayer kept", async () => {
    const it = mountCart({ items: [...ITEMS, { ...ITEMS[0], cartItemId: 201, sellerId: 22, sellerKey: "4e5f6a7b", quantity: 1 }] });
    it.press("Seller B");
    await it.idle();
    expect(it.done()).toBe(true);
    expect(stashed(it)).toEqual(SET_ASIDE);
    expect(it.tip()).toBe("Set aside 3 items from 2 other sellers; only Seller B is left to check out");
  });

  test("a listing back in the cart and set aside again is one entry, and is put back as many as it was", async () => {
    const it = mountCart({ items: kept(["Llanowar Elves", "Counterspell"]), stash: stashOf(["Llanowar Elves"]) });
    it.press("Seller B");
    await it.idle();
    expect(it.stash()).toEqual(stashOf(["Llanowar Elves"]));
    await it.settle(600);
    it.back().click();
    await it.idle();
    expect(it.asked.filter((a) => a.path === "items/bulkadd")[0].body.items.map((i) => i.requestedQuantity)).toEqual([2]);
  });

  test("a listing set aside again while some of it still is adds to its entry", async () => {
    const it = mountCart({ items: [{ ...ITEMS[0], quantity: 1 }, ...kept(["Counterspell"])], stash: stashOf(["Llanowar Elves"]) });
    it.press("Seller B");
    await it.idle();
    expect(it.stash().items.length).toBe(1);
    expect(it.stash().items[0].quantity).toBe(3);
  });

  test("with no cart key it says so and asks nothing", async () => {
    const it = mountCart({ cookie: "" });
    it.press("Seller B");
    await it.settle();
    expect(it.asked).toEqual([]);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("TCGplayer's cart could not be found; reload the page");
  });

  test("what a run did is shown again once the page is back", () => {
    const it = mountCart({ said: { text: "Set aside 3 items from 2 other sellers; only Seller B is left to check out", failed: false } });
    expect(it.tip()).toBe("Set aside 3 items from 2 other sellers; only Seller B is left to check out");
    expect(it.done()).toBe(true);
    expect(it.said()).toBe(null);
  });
});

describe("Put back", () => {
  test("adds each set-aside listing back from its seller at its price, and empties the list", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE) });
    expect(it.back().disabled).toBe(false);
    expect(it.word()).toBe("3 in stash");
    expect(it.tip()).toBe("Put back what is in stash, from the sellers it came from");
    it.back().click();
    await it.idle();
    expect(it.cart().sort()).toEqual(["Counterspell", "Giant Growth", "Lightning Bolt", "Llanowar Elves"]);
    expect(it.asked.map((a) => a.method + " " + a.path.replace(/\?.*$/, ""))).toEqual(["POST validatecart", "POST items/bulkadd", "POST validatecart"]);
    expect(it.asked[1].body).toEqual({
      items: [
        { sku: 1001, sellerId: 11, channelId: 0, requestedQuantity: 2, price: 0.5, isDirect: false, customListingKey: null },
        { sku: 1002, sellerId: 11, channelId: 0, requestedQuantity: 1, price: 0.25, isDirect: false, customListingKey: null },
        { sku: 1004, sellerId: 33, channelId: 0, requestedQuantity: 1, price: 1, isDirect: true, customListingKey: null },
      ],
    });
    expect(it.stash()).toBe(null);
    expect(it.tip()).toBe("Put back 3 items");
    expect(it.done()).toBe(true);
    expect(it.back().disabled).toBe(true);
    expect(it.reloads()).toBe(1);
  });

  test("leaves out a listing the cart already holds", async () => {
    const it = mountCart({ items: kept(["Counterspell", "Llanowar Elves"]), stash: stashOf(SET_ASIDE) });
    it.back().click();
    await it.idle();
    expect(it.asked[1].body.items.map((i) => i.sku)).toEqual([1002, 1004]);
    expect(it.cart().filter((n) => n === "Llanowar Elves").length).toBe(1);
    expect(it.tip()).toBe("Put back 3 items");
  });

  test("names a listing that did not come back as no longer for sale", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE), soldOut: ["Giant Growth"] });
    it.back().click();
    await it.idle();
    expect(it.tip()).toBe("Put back 2 items; no longer for sale: Giant Growth (Lightly Played) from Seller A");
    expect(it.failed()).toBe(true);
    expect(it.stash()).toBe(null);
    expect(it.asked.map((a) => a.method + " " + a.path.replace(/\?.*$/, ""))).toEqual([
      "POST validatecart",
      "POST items/bulkadd",
      "POST validatecart",
      "POST getProductForSkus",
    ]);
    expect(it.asked[3].body).toEqual([1002]);
    expect(it.asked[3].at - it.asked[2].at).toBeGreaterThanOrEqual(100);
  });

  test("a card the catalogue does not name is told by its SKU", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE), soldOut: ["Lightning Bolt"], unnamed: true });
    it.back().click();
    await it.idle();
    expect(it.tip()).toBe("Put back 2 items; no longer for sale: SKU 1004 from TCGplayer Direct");
    expect(it.stash()).toBe(null);
    expect(it.reloads()).toBe(1);
  });

  test("names a listing whose price changed", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE), priceNow: { "Llanowar Elves": 0.75 } });
    it.back().click();
    await it.idle();
    expect(it.tip()).toBe("Put back 3 items; price changed: Llanowar Elves (Near Mint) from Seller A, $0.50 now $0.75");
    expect(it.done()).toBe(true);
  });

  test("refused, keeps everything set aside to try again", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE), refuseAdd: true });
    it.back().click();
    await it.idle();
    expect(it.stash()).toEqual(stashOf(SET_ASIDE));
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("TCGplayer answered 500; put back 0 items");
    expect(it.back().disabled).toBe(false);
    expect(it.reloads()).toBe(0);
  });

  test("is not pressed twice while it runs", async () => {
    const it = mountCart({ items: kept(["Counterspell"]), stash: stashOf(SET_ASIDE) });
    it.back().click();
    expect(it.back().disabled).toBe(true);
    it.back().click();
    it.press("Seller A");
    await it.idle();
    expect(it.asked.length).toBe(3);
  });
});

describe("Consolidate", () => {
  const seller = (sellerId, sellerKey, quantity, isConsignment = false) => ({ sellerId, sellerKey, quantity, isConsignment });
  const ELVES = seller(11, "0a1b2c3d", 2);
  const STOCK = {
    "1001-0.5": { dia: 10, sellers: [ELVES] },
    "1003-2": { dia: 5, sellers: [seller(22, "4e5f6a7b", 1)] },
  };
  const ELVES_AND_BOLT = () => kept(["Llanowar Elves", "Lightning Bolt"]);
  const route = (it) => it.asked.map((a) => a.method + " " + a.path.replace(/\?.*$/, ""));
  const added = (it) => it.asked.filter((a) => a.path === "items/bulkadd").map((a) => a.body.items.map((i) => i.sellerId + " x" + i.requestedQuantity + (i.isDirect ? " Direct" : "")));

  test("sits after Only this seller on Direct's package alone", () => {
    const it = mountCart();
    expect(it.doc.querySelectorAll(".ban-consolidate").length).toBe(1);
    expect(it.consolidate().closest("article").getAttribute("data-testid")).toBe("packageContainerFor-TCGplayer Direct");
    expect([...it.consolidate().parentElement.children].map((c) => c.textContent)).toEqual(["Only this seller", "Consolidate"]);
    expect(it.consolidate().parentElement.nextElementSibling.className).toBe("all-items-actions");
  });

  test("moves every other item into Direct from its own seller at its price, and sets aside what Direct has none of", async () => {
    const it = mountCart({ direct: STOCK });
    it.consolidate().click();
    await it.idle();
    expect(route(it)).toEqual([
      "POST validatecart",
      "POST getProductForSkus",
      "POST directQuantitiesAtPrice",
      "DELETE items/bulkdelete",
      "POST items/bulkadd",
      "POST validatecart",
    ]);
    expect(it.asked[1].body).toEqual([1001, 1002, 1003]);
    expect(it.asked[2].body).toEqual({
      items: [
        { sku: 1001, productId: 501, price: 0.5 },
        { sku: 1002, productId: 502, price: 0.25 },
        { sku: 1003, productId: 503, price: 2 },
      ],
      nonDirectSellersInCart: [],
    });
    expect(it.asked[3].body).toEqual({ items: [101, 102, 103] });
    expect(it.asked[4].body).toEqual({
      items: [
        { sku: 1001, sellerId: 11, channelId: 0, requestedQuantity: 2, price: 0.5, isDirect: true, customListingKey: null },
        { sku: 1003, sellerId: 22, channelId: 0, requestedQuantity: 1, price: 2, isDirect: true, customListingKey: null },
      ],
    });
    expect(it.lines()).toEqual(["Lightning Bolt 33 x1 Direct", "Llanowar Elves 11 x2 Direct", "Counterspell 22 x1 Direct"]);
    expect(it.stash()).toEqual(stashOf(["Giant Growth"]));
    expect(it.tip()).toBe("Consolidated 3 cards into Direct; 1 card in stash that Direct has no room for: Giant Growth (Lightly Played), 1 of 1");
    expect(it.done()).toBe(true);
    expect(it.reloads()).toBe(1);
    for (let i = 1; i < it.asked.length; i++) {
      expect(it.asked[i].at - it.asked[i - 1].at).toBeGreaterThanOrEqual(100);
    }
  });

  test("takes no more than Direct has room for, and Put back adds the rest as it was", async () => {
    const it = mountCart({ items: ELVES_AND_BOLT(), direct: { "1001-0.5": { dia: 1, sellers: [ELVES] } } });
    it.consolidate().click();
    await it.idle();
    expect(it.lines()).toEqual(["Lightning Bolt 33 x1 Direct", "Llanowar Elves 11 x1 Direct"]);
    expect(it.tip()).toBe("Consolidated 1 card into Direct; 1 card in stash that Direct has no room for: Llanowar Elves (Near Mint), 1 of 2");
    expect(it.stash().items).toEqual([{ ...stashOf(["Llanowar Elves"]).items[0], quantity: 1 }]);
    await it.settle(600);
    it.back().click();
    await it.idle();
    expect(added(it)).toEqual([["11 x1 Direct"], ["11 x1"]]);
    expect(it.lines()).toEqual(["Lightning Bolt 33 x1 Direct", "Llanowar Elves 11 x1 Direct", "Llanowar Elves 11 x1"]);
    expect(it.stash()).toBe(null);
  });

  test("counts what Direct already ships of a card against its room", async () => {
    const bolt = { ...ITEMS[3], cartItemId: 105, sellerId: 44, sellerKey: "9a9b9c9d", isDirect: false };
    const it = mountCart({ items: [ITEMS[3], bolt], direct: { "1004-1": { dia: 1, sellers: [seller(33, "8c9d0e1f", 1), seller(44, "9a9b9c9d", 1)] } } });
    it.consolidate().click();
    await it.idle();
    expect(added(it)).toEqual([]);
    expect(it.lines()).toEqual(["Lightning Bolt 33 x1 Direct"]);
    expect(it.tip()).toBe("Consolidated 0 cards into Direct; 1 card in stash that Direct has no room for: Lightning Bolt (Near Mint), 1 of 1");
  });

  test("takes from the item's own seller first, then from other Direct sellers", async () => {
    const own = mountCart({ items: ELVES_AND_BOLT(), direct: { "1001-0.5": { dia: 10, sellers: [seller(99, "99999999", 5), ELVES] } } });
    own.consolidate().click();
    await own.idle();
    expect(added(own)).toEqual([["11 x2 Direct"]]);
    const short = mountCart({ items: ELVES_AND_BOLT(), direct: { "1001-0.5": { dia: 10, sellers: [seller(99, "99999999", 5), seller(11, "0a1b2c3d", 1)] } } });
    short.consolidate().click();
    await short.idle();
    expect(added(short)).toEqual([["11 x1 Direct", "99 x1 Direct"]]);
    expect(short.tip()).toBe("Consolidated 2 cards into Direct");
    expect(short.stash()).toBe(null);
  });

  test("counts consigned stock past Direct's cap, as the page does", async () => {
    const it = mountCart({ items: ELVES_AND_BOLT(), direct: { "1001-0.5": { dia: 1, sellers: [seller(11, "0a1b2c3d", 1), seller(77, "77777777", 1, true)] } } });
    it.consolidate().click();
    await it.idle();
    expect(added(it)).toEqual([["11 x1 Direct", "77 x1 Direct"]]);
  });

  test("asks sellers not on consignment for no more than Direct's cap, and consigned ones for the rest", async () => {
    const five = { ...ITEMS[0], quantity: 5 };
    const it = mountCart({ items: [five, ITEMS[3]], direct: { "1001-0.5": { dia: 2, sellers: [seller(11, "0a1b2c3d", 5), seller(77, "77777777", 3, true)] } } });
    it.consolidate().click();
    await it.idle();
    expect(added(it)).toEqual([["11 x2 Direct", "77 x3 Direct"]]);
    expect(it.tip()).toBe("Consolidated 5 cards into Direct");
  });

  test("changes nothing when the catalogue or Direct's stock does not answer", async () => {
    for (const refusal of [{ unnamed: true }, { refuseStock: true }]) {
      const it = mountCart({ direct: STOCK, ...refusal });
      it.consolidate().click();
      await it.idle();
      expect(it.asked.some((a) => a.method === "DELETE")).toBe(false);
      expect(it.cart().length).toBe(4);
      expect(it.stash()).toBe(null);
      expect(it.failed()).toBe(true);
      expect(it.tip()).toBe("TCGplayer answered 503");
      expect(it.reloads()).toBe(0);
    }
  });

  test("a refused add keeps everything taken out set aside, for Put back", async () => {
    const it = mountCart({ direct: STOCK, refuseAdd: true });
    it.consolidate().click();
    await it.idle();
    expect(it.lines()).toEqual(["Lightning Bolt 33 x1 Direct"]);
    expect(it.stash()).toEqual(stashOf(["Llanowar Elves", "Giant Growth", "Counterspell"]));
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("TCGplayer answered 500; consolidated 0 cards into Direct; 4 cards in stash");
    expect(it.reloads()).toBe(1);
  });

  test("a refused removal adds nothing and sets nothing aside", async () => {
    const it = mountCart({ direct: STOCK, refuseDelete: true });
    it.consolidate().click();
    await it.idle();
    expect(added(it)).toEqual([]);
    expect(it.cart().length).toBe(4);
    expect(it.stash()).toBe(null);
    expect(it.tip()).toBe("TCGplayer answered 500; consolidated 0 cards into Direct; 0 cards in stash");
    expect(it.reloads()).toBe(0);
  });

  test("with Direct alone in the cart it says so and changes nothing", async () => {
    const it = mountCart({ items: kept(["Lightning Bolt"]), direct: STOCK });
    it.consolidate().click();
    await it.idle();
    expect(it.asked.length).toBe(1);
    expect(it.tip()).toBe("Only TCGplayer Direct is in the cart");
    expect(it.reloads()).toBe(0);
  });
});
