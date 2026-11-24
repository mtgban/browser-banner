// The cart: Remove seller and Only this seller at the right of each
// seller's row, and Put back on the panel.

import { test, expect, describe } from "bun:test";
import { mountCart } from "./cart.js";

const ALL = ["Grim Guardian", "Pinnacle Monk // Mystic Peak", "Alloy Myr", "Pyrrhic Revival"];

describe("the cart", () => {
  test("puts Remove seller and Only this seller at the right of each seller's row, and back after a redraw", async () => {
    const it = mountCart();
    expect(it.rows()).toBe(3);
    expect([...it.doc.querySelector(".ban-seller").querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Remove seller", "Only this seller"]);
    for (const row of it.doc.querySelectorAll(".ban-seller")) {
      expect(row.parentElement.className).toContain("justify-between");
      expect(row.parentElement.lastElementChild === row).toBe(true);
    }
    expect([...it.doc.querySelector(".ban-seller").children].map((b) => b.className)).toEqual(["ban-remove", "ban-only"]);
    it.doc.querySelector(".ban-seller").remove();
    await it.settle(600);
    expect(it.rows()).toBe(3);
    expect(it.back().disabled).toBe(true);
    expect(it.tip()).toBe("Beside each seller: Remove seller, or Only this seller to set the others aside");
  });

  test("goes in the name's box where the page draws no row across", () => {
    const it = mountCart();
    const row = it.doc.querySelector(".justify-between");
    row.className = "";
    it.doc.querySelector("main").className = "justify-between";
    it.doc.querySelectorAll(".ban-seller").forEach((r) => r.remove());
    expect(it.window.MPB.sellers(it.doc)[0].header === it.doc.querySelector("h3").parentElement).toBe(true);
  });

  test("Remove seller takes out that seller's items alone, through ManaPool's own list, and sets nothing aside", async () => {
    const it = mountCart();
    it.press("Seller A", "Remove seller");
    await it.settle(400);
    expect(it.names()).toEqual(["Alloy Myr", "Pyrrhic Revival"]);
    expect(it.stored()).toEqual(["inv-3", "inv-4"]);
    expect(it.stash()).toBe(null);
    expect(it.tip()).toBe("Removed 2 items from Seller A");
  });

  test("Remove seller takes the items ManaPool shows now, after a redraw of them", async () => {
    const it = mountCart();
    it.redraw("Seller A");
    it.press("Seller A", "Remove seller");
    await it.settle(400);
    expect(it.names()).toEqual(["Alloy Myr", "Pyrrhic Revival"]);
    expect(it.tip()).toBe("Removed 2 items from Seller A");
  });

  test("Put back waits for ManaPool to sync, and keeps what was set aside until it does", async () => {
    const it = mountCart({ noSync: true });
    it.press("Seller B", "Only this seller");
    await it.settle(500);
    it.back().click();
    await it.settle(500);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("ManaPool has not synced the cart yet; keep its tab in front, then Put back again");
    expect(it.stash().items.length).toBe(3);
    expect(it.back().disabled).toBe(false);
  });

  test("a second Put back, once ManaPool has synced, reports what came back", async () => {
    const it = mountCart({ noSync: true });
    it.press("Seller B", "Only this seller");
    await it.settle(500);
    it.back().click();
    await it.settle(500);
    it.focused();
    it.back().click();
    await it.settle(200);
    expect(it.tip()).toBe("Put back 3 items");
    expect(it.names().sort()).toEqual(["Alloy Myr", "Grim Guardian", "Pinnacle Monk // Mystic Peak", "Pyrrhic Revival"]);
    expect(it.stash()).toBe(null);
  });

  test("Only this seller sets every other seller's items aside, each with its listing and seller", async () => {
    const it = mountCart();
    it.press("Seller B", "Only this seller");
    await it.settle(500);
    expect(it.names()).toEqual(["Alloy Myr"]);
    expect(it.stored()).toEqual(["inv-3"]);
    const stash = it.stash();
    expect(stash.items.map((s) => [s.entry.inventoryId, s.entry.quantitySelected, s.seller.name, s.item.name, s.item.set, s.item.tags])).toEqual([
      ["inv-1", 1, "Seller A", "Grim Guardian", "Journey into Nyx", "Foil LP"],
      ["inv-2", 1, "Seller A", "Pinnacle Monk // Mystic Peak", "Modern Horizons 3", "NM"],
      ["inv-4", 1, "Seller C", "Pyrrhic Revival", "Eventide", "Foil LP"],
    ]);
    expect(it.tip()).toBe("Set aside 3 items from 2 other sellers; only Seller B is left to check out");
    expect(it.word()).toBe("3 items set aside");
    expect(it.back().disabled).toBe(false);
  });

  test("Put back returns the set-aside listings to the cart, from their own sellers", async () => {
    const it = mountCart();
    it.press("Seller B", "Only this seller");
    await it.settle(500);
    it.back().click();
    await it.settle(400);
    expect(it.names().sort()).toEqual([...ALL].sort());
    expect(it.stored().sort()).toEqual(["inv-1", "inv-2", "inv-3", "inv-4"]);
    expect(it.stash()).toBe(null);
    expect(it.tip()).toBe("Put back 3 items");
    expect(it.back().disabled).toBe(true);
    // As ManaPool's own add queues them: listing, quantity, source, touched.
    expect(it.announced.at(-1)).toEqual([["inv-1", 1, null, true], ["inv-2", 1, null, true], ["inv-4", 1, null, true]]);
  });

  test("Put back leaves out a listing the cart already holds", async () => {
    const it = mountCart({ stash: { items: [{ entry: { inventoryId: "inv-1", quantitySelected: 1 }, seller: { slug: "seller-a", name: "Seller A" }, item: { name: "Grim Guardian" } }] } });
    it.back().click();
    await it.settle(400);
    // In the cart once, and counted as back: it is there to check out.
    expect(it.stored()).toEqual(["inv-1", "inv-2", "inv-3", "inv-4"]);
    expect(it.announced.at(-1)).toEqual([]);
    expect(it.tip()).toBe("Put back 1 item");
  });

  test("Put back names a listing that sold out meanwhile, and its seller", async () => {
    const it = mountCart({ soldOut: ["Pyrrhic Revival"] });
    it.press("Seller B", "Only this seller");
    await it.settle(500);
    it.back().click();
    await it.settle(400);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Put back 2 items; no longer listed: Pyrrhic Revival from Seller C");
  });

  test("what was set aside is still there on coming back to the cart", () => {
    const it = mountCart({ stash: { items: [{ entry: { inventoryId: "inv-9", quantitySelected: 2 }, seller: { slug: "s", name: "Seller Z" }, item: { name: "X" } }] } });
    expect(it.word()).toBe("1 item set aside");
    expect(it.back().disabled).toBe(false);
  });

  test("an item ManaPool does not take out stops the run and says which", async () => {
    const it = mountCart({ refuse: ["Pinnacle Monk // Mystic Peak"] });
    it.press("Seller A", "Remove seller");
    await it.settle(600);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("ManaPool did not take out Pinnacle Monk // Mystic Peak; 1 item taken out before it");
    expect(it.names()).toEqual(["Pinnacle Monk // Mystic Peak", "Alloy Myr", "Pyrrhic Revival"]);
  });

  test("a list with no remove is closed again, and the run stops", async () => {
    const it = mountCart({ noRemove: ["Grim Guardian"] });
    it.press("Seller A", "Remove seller");
    await it.settle(400);
    expect(it.tip()).toBe("ManaPool offered no remove for Grim Guardian; 0 items taken out before it");
    expect(it.doc.querySelector('[role="listbox"]') === null).toBe(true);
    expect(it.names()).toEqual(ALL);
  });

  test("Escape stops between items", async () => {
    const it = mountCart();
    it.window.MPB.STEP = 300;
    it.press("Seller A", "Remove seller");
    await it.settle(100);
    it.escape();
    await it.settle(500);
    expect(it.names()).toEqual(["Pinnacle Monk // Mystic Peak", "Alloy Myr", "Pyrrhic Revival"]);
  });

  test("leaving the cart takes the panel and the seller buttons away", async () => {
    const it = mountCart();
    it.visit("/cards");
    await it.settle(600);
    expect(it.shown()).toBe(false);
    expect(it.rows()).toBe(0);
  });
});
