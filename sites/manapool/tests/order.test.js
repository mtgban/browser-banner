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

  test("Send to BAN opens mtgban's upload on the click and hands it the CSV's rows", async () => {
    const it = mount({ path: ORDER });
    it.send();
    expect(it.tabs[0].url).toBe("https://mtgban.com/upload/handoff");
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the order");
    await it.settle();
    it.ready();
    await it.settle();
    const posted = it.tabs[0].posted[0];
    expect(posted.origin).toBe("https://mtgban.com");
    expect(posted.data.rows).toBe(6);
    expect(posted.data.source).toBe("https://manapool.com" + ORDER);
    expect(posted.data.csv.split("\n")[0]).toBe(HEADER);
    expect(it.tip()).toBe("Sent 8 cards to BAN; " + LEFT);
  });

  test("an order with no cards to send closes the tab and says so", async () => {
    const o = detail();
    o.order_seller_details.forEach((s) => (s.fulfillments = [{ status: "refunded" }]));
    const it = mount({ path: ORDER, order: { order: o } });
    it.send();
    await it.settle();
    expect(it.tabs[0].closed).toBe(true);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toMatch(/^No cards to send; left out: \d+ refunded cards/);
  });

  test("Send to BAN that cannot read the order says why and closes the tab it opened", async () => {
    const it = mount({ path: ORDER, answer: () => Promise.resolve({ ok: false, status: 401, headers: { get: () => null }, json: () => Promise.resolve({}) }) });
    it.send();
    await it.settle();
    expect(it.tabs[0].closed).toBe(true);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
  });

  test("counts a sealed product by its copies, as every other card left out is", () => {
    const it = mount({ path: "/" });
    const o = detail();
    o.order_seller_details[1].items[3].quantity = 3;
    expect(it.window.MPB.orderLines(o).left.sealed).toBe(3);
  });

  test("a blocked pop-up is a red cross saying so", async () => {
    const it = mount({ path: ORDER, blockPopups: true });
    it.send();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("The upload page was blocked; allow pop-ups here and try again");
  });

  test("a visitor not signed in is told to sign in", async () => {
    const it = mount({ path: ORDER, answer: () => Promise.resolve({ ok: false, status: 401, headers: { get: () => null }, json: () => Promise.resolve({}) }) });
    it.csv();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
    expect(it.saved).toEqual([]);
  });

  test("gets no panel on a suborder's page, or an address that is not an order", async () => {
    expect(mount({ path: "/settings/orders/suborder/3080d432-2d89-4964-ba3a-8fd265e008e2" }).shown()).toBe(false);
    expect(mount({ path: "/settings/orders/not-an-id" }).shown()).toBe(false);
  });
});
