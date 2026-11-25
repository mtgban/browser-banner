// An order's page: its cards from the API's order detail, as CSV or sent to
// BAN.

import { test, expect, describe } from "bun:test";
import { mount, text } from "./panel.js";

const ORDER = "/settings/orders/3e28cf57-6020-47e1-89ca-f4ee167de083";
const HEADER = "Scryfall ID,Name,Set,Number,Finish,Condition,Language,Quantity,Price";
const LEFT = "left out: 2 refunded cards, 1 card replaced by another order, 1 card replaced with one ManaPool does not name, 1 sealed product, 1 unreadable line";

const detail = () => JSON.parse(text("order.json")).order;

describe("an order's cards", () => {
  const it = mount({ path: "/" });
  const lines = (o = detail()) => it.window.MPB.orderLines(o);

  test("are one line per card received, every seller's, and what was left out is counted", () => {
    const r = lines();
    expect(r.lines.map((l) => [l.name, l.set, l.number, l.finish, l.condition, l.quantity, l.price])).toEqual([
      ["Arboreal Grazer", "RVR", "343", "Nonfoil", "NM", 1, 19],
      ["Vanquish the Horde", "MID", "333", "Foil", "NM", 2, 27],
      ["Valentin, Dean of the Vein // Lisette, Dean of the Root", "STX", "161", "Etched Foil", "LP", 1, 8],
      ["Corpsejack Menace", "MB1", "197", "Nonfoil", "MP", 2, 15],
      ["Remote Isle", "USG", "324", "Nonfoil", "HP", 1, 30],
      ["Flashfires", "5ED", "226", "Nonfoil", "NM", 1, 25],
    ]);
    expect(r.left).toEqual({ refunded: 2, away: 1, unnamed: 1, sealed: 1, unreadable: 1 });
  });

  test("carry each card's Scryfall id", () => {
    const o = detail();
    expect(lines(o).lines[0].scryfall).toBe(o.order_seller_details[0].items[0].product.single.scryfall_id);
  });

  test("leave out a seller ManaPool refunded, whatever its items say", () => {
    const o = detail();
    o.order_seller_details[0].fulfillments = [{ status: "refunded" }];
    expect(lines(o).lines.map((l) => l.name)).toEqual(["Remote Isle", "Flashfires"]);
  });

  test("count a line whose card does not read whole, and keep the rest", () => {
    const o = detail();
    o.order_seller_details[0].items[0].product.single.scryfall_id = "not-an-id";
    o.order_seller_details[0].items[1].product.single.condition_id = "??";
    const r = lines(o);
    expect(r.left.unreadable).toBe(3);
    expect(r.lines.length).toBe(4);
  });

  test("refuse an answer with no order", () => {
    expect(() => lines(null)).toThrow("ManaPool answered with no order");
  });

  test("are written under headers mtgban's upload reads, and no other number", () => {
    const csv = it.window.MPB.orderCSV(lines().lines).trimEnd().split("\n");
    expect(csv[0]).toBe(HEADER);
    expect(csv[3]).toBe(detail().order_seller_details[0].items[2].product.single.scryfall_id + ',"Valentin, Dean of the Vein // Lisette, Dean of the Root",STX,161,Etched Foil,LP,EN,1,0.08');
  });
});

describe("an order's panel", () => {
  test("offers Send to BAN and CSV, and asks for nothing until clicked", () => {
    const it = mount({ path: ORDER });
    expect(it.heading()).toBe("MP BANner");
    expect(it.tip()).toBe("Send this order's cards to BAN, or save them as CSV");
    expect(it.asked).toEqual([]);
  });

  test("CSV reads the order once and saves its cards, named for its number", async () => {
    const it = mount({ path: ORDER });
    it.csv();
    await it.settle();
    expect(it.asked).toEqual(["/api/v1/buyer/orders/3e28cf57-6020-47e1-89ca-f4ee167de083"]);
    const file = await it.file();
    expect(file.name).toBe("mp-order-1006.csv");
    expect(file.text.trimEnd().split("\n").length).toBe(7);
    expect(it.heading()).toBe("MP BANner - 8 cards✓");
    expect(it.tip()).toBe("Saved mp-order-1006.csv; " + LEFT);
    it.csv();
    await it.settle();
    expect(it.asked.length).toBe(1);
  });

  test("Send to BAN opens mtgban's upload with the CSV's rows in the link, which says where it is from", async () => {
    const it = mount({ path: ORDER });
    it.send();
    expect(it.busy()).toBe(true);
    await it.settle();
    expect(it.links[0].url.split("#")[0]).toBe("https://mtgban.com/upload/handoff");
    expect([it.links[0].target, it.links[0].rel, it.links[0].referrer, it.links[0].placed]).toEqual(["_blank", "noopener", "origin", true]);
    const sent = it.sent();
    expect(sent.rows).toBe(6);
    expect(sent.source).toBe("https://manapool.com" + ORDER);
    expect(sent.csv.split("\n")[0]).toBe(HEADER);
    expect(it.busy()).toBe(false);
    expect(it.tip()).toBe("Opened mtgban's upload with 8 cards; " + LEFT);
    expect(it.window.document.querySelector('a[target="_blank"]') === null).toBe(true);
  });

  test("CSV works after Send to BAN, and Send to BAN again, with the one read", async () => {
    const it = mount({ path: ORDER });
    it.send();
    await it.settle();
    it.csv();
    await it.settle();
    expect((await it.file()).name).toBe("mp-order-1006.csv");
    it.send();
    await it.settle();
    expect(it.links.length).toBe(2);
    expect(it.asked.length).toBe(1);
  });

  test("a read that outlasts the click opens nothing, and the next click sends", async () => {
    const it = mount({ path: ORDER, activation: false });
    it.send();
    await it.settle();
    expect(it.links).toEqual([]);
    expect(it.tip()).toBe("Ready: press Send to BAN again");
    expect(it.heading()).toBe("MP BANner - 8 cards");
    it.window.navigator.userActivation.isActive = true;
    it.send();
    await it.settle();
    expect(it.links.length).toBe(1);
  });

  test("a browser that does not say whether a click still counts is given a second", () => {
    const it = mount({ path: ORDER, activation: null });
    expect(it.window.MPB.mayOpen(Date.now())).toBe(true);
    expect(it.window.MPB.mayOpen(Date.now() - 2000)).toBe(false);
  });

  test("more cards than an address can carry are not sent", async () => {
    const it = mount({ path: ORDER });
    it.window.MPB.LONGEST = 500;
    it.send();
    await it.settle();
    expect(it.links).toEqual([]);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Too many cards to send; save them as CSV instead");
  });

  test("a game the store may not send has no link", () => {
    const it = mount({ path: "/" });
    const sender = it.window.BAN.handoff({ games: ["magic"], words: {} });
    expect(sender.linkURL("pokemon", { csv: "a", rows: 1 })).toBe("");
    expect(sender.linkURL("magic", { csv: "a", rows: 1 })).toMatch(/^https:\/\/mtgban\.com\/upload\/handoff#/);
  });

  test("an order with no cards to send opens nothing and says so", async () => {
    const o = detail();
    o.order_seller_details.forEach((s) => (s.fulfillments = [{ status: "refunded" }]));
    const it = mount({ path: ORDER, order: { order: o } });
    it.send();
    await it.settle();
    expect(it.links).toEqual([]);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toMatch(/^No cards to send; left out: \d+ refunded cards/);
  });

  test("Send to BAN that cannot read the order says why and opens nothing", async () => {
    const it = mount({ path: ORDER, answer: () => Promise.resolve({ ok: false, status: 401, headers: { get: () => null }, json: () => Promise.resolve({}) }) });
    it.send();
    await it.settle();
    expect(it.links).toEqual([]);
    expect(it.busy()).toBe(false);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
  });

  test("Escape while the order is read sends nothing", async () => {
    const it = mount({ path: ORDER });
    it.send();
    it.escape();
    await it.settle();
    expect(it.links).toEqual([]);
    expect(it.busy()).toBe(false);
  });

  test("counts a sealed product by its copies, as every other card left out is", () => {
    const it = mount({ path: "/" });
    const o = detail();
    o.order_seller_details[1].items[3].quantity = 3;
    expect(it.window.MPB.orderLines(o).left.sealed).toBe(3);
  });

  test("a visitor not signed in is told to sign in", async () => {
    const it = mount({ path: ORDER, answer: () => Promise.resolve({ ok: false, status: 401, headers: { get: () => null }, json: () => Promise.resolve({}) }) });
    it.csv();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
    expect(it.saved).toEqual([]);
  });

  test("gets no panel on an address that is not an order", () => {
    expect(mount({ path: "/settings/orders/not-an-id" }).shown()).toBe(false);
    expect(mount({ path: "/settings/orders/suborder/not-an-id" }).shown()).toBe(false);
  });
});

describe("a package's panel", () => {
  const WHOLE = "3e28cf57-6020-47e1-89ca-f4ee167de083";
  const PACKAGE = "/settings/orders/suborder/c86308a3-429b-4def-959c-11d466f6d437";
  // The package page's own heading, with the order it is part of.
  const page = (links = `<a href="/settings/orders/${WHOLE}">order</a>`, number = "1006-2011") =>
    `<a href="/settings/orders">Orders</a><main><div><div><h1>Package #${number} </h1><p>Part of your ${links} placed on 11/21/2026.</p></div></div>
     <a href="/settings/orders/254746ab-089b-48a5-9583-dbe120d1ec6b">another</a></main>`;

  test("sends the cards its order lists under it, and no other seller's", async () => {
    const it = mount({ path: PACKAGE, page: page() });
    expect(it.tip()).toBe("Send this package's cards to BAN, or save them as CSV");
    expect(it.asked).toEqual([]);
    it.send();
    await it.settle();
    expect(it.asked).toEqual(["/api/v1/buyer/orders/" + WHOLE]);
    expect(it.sent().csv.trimEnd().split("\n").slice(1).map((l) => l.split(",")[1])).toEqual(["Remote Isle", "Flashfires"]);
    expect(it.sent().source).toBe("https://manapool.com" + PACKAGE);
  });

  test("CSV is named for the package's number", async () => {
    const it = mount({ path: PACKAGE, page: page(`<a href="https://manapool.com/settings/orders/${WHOLE}">order</a>`) });
    it.csv();
    await it.settle();
    const file = await it.file();
    expect(file.name).toBe("mp-package-1006-2011.csv");
    expect(file.text.trimEnd().split("\n").length).toBe(3);
  });

  test("is known by its number too, where the API's id is another", async () => {
    const o = detail();
    o.order_seller_details[1].id = "00000000-0000-4000-8000-000000000000";
    const it = mount({ path: PACKAGE, page: page(), order: { order: o } });
    it.csv();
    await it.settle();
    expect((await it.file()).name).toBe("mp-package-1006-2011.csv");
  });

  test("that its order does not list, or lists twice, is a red cross", async () => {
    for (const number of ["1006-9999", "1006-2010"]) {
      const o = detail();
      if (number === "1006-9999") o.order_seller_details.splice(1, 1);
      const it = mount({ path: PACKAGE, page: page(undefined, number), order: { order: o } });
      it.csv();
      await it.settle();
      expect(it.failed()).toBe(true);
      expect(it.tip()).toBe("ManaPool's order does not list this package");
      expect(it.saved).toEqual([]);
    }
  });

  test("that names no order, or two, asks for nothing", async () => {
    for (const links of ["order", `<a href="/settings/orders/${WHOLE}">order</a> <a href="/settings/orders/254746ab-089b-48a5-9583-dbe120d1ec6b">order</a>`]) {
      const it = mount({ path: PACKAGE, page: page(links) });
      it.csv();
      await it.settle();
      expect(it.asked).toEqual([]);
      expect(it.tip()).toBe("This page does not say which order the package is part of");
    }
  });
});
