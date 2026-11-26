import { test, expect, describe } from "bun:test";
import { mount, ordersAged } from "./panel.js";
import { pageBody, pages } from "./pages.js";

const HEADER = "Order Number,Order Date,Sellers,Packages,Items,Subtotal,Shipping,Tax,Fees,Total,Refunded,Net";
// Each fixture order's line from Subtotal on, its page's charges in.
const AMOUNTS = {
  1006: "48.57,5.40,0.00,2.04,56.01,56.01,0.00",
  1005: "113.41,14.85,0.00,13.16,141.42,118.17,23.25",
  1004: "6.16,1.30,0.00,0.26,7.72,,",
  1003: "42.51,5.00,0.00,1.79,49.30,3.01,46.29",
  1002: "4.73,1.25,0.39,0.20,6.57,1.50,5.07",
  1001: "1.98,1.25,0.16,0.00,3.39,0.00,3.39",
};
const amounts = (line) => line.split(",").slice(-7).join(",");
const dataURL = (o) => "/settings/orders/" + o.id + "/__data.json";

describe("an order's line", () => {
  const it = mount({ path: "/" });
  const row = (o) => it.window.MPB.orderRow(o);

  test("folds its sellers' suborders into one line, amounts as the API gives them", () => {
    const o = ordersAged()[4];
    const r = row(o);
    expect([r.id, r.number, r.sellers, r.packages, r.items, r.subtotal, r.shipping, r.tax]).toEqual([
      o.id, "1005", "Seller E; Seller F; Seller G; Seller H", 4, 101, 11341, 1485, 0,
    ]);
    expect([r.fees, r.total, r.refunded, r.net]).toEqual([null, null, null, null]);
    const placed = new Date(o.created_at);
    expect(r.date).toEqual({ year: placed.getFullYear(), month: placed.getMonth() + 1, day: placed.getDate() });
    expect(r.dateText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test("is null for an order not whole", () => {
    const o = ordersAged()[0];
    expect(row({ ...o, total_cents: "339" })).toBe(null);
    expect(row({ ...o, created_at: "yesterday" })).toBe(null);
    expect(row({ ...o, order_number: "" })).toBe(null);
    expect(row({ ...o, order_seller_details: undefined })).toBe(null);
    const seller = o.order_seller_details[0];
    expect(row({ ...o, order_seller_details: [{ ...seller, item_count: undefined }] })).toBe(null);
    expect(row({ ...o, order_seller_details: [{ ...seller, seller_username: "" }] })).toBe(null);
  });

  test("writes the history's CSV, one line each, amounts in dollars", () => {
    const charged = it.window.MPB.charged(row(ordersAged()[2]), { fees: 179, total: 4930, refunded: 301, unstated: false });
    const lines = it.window.MPB.historyCSV([charged, row(ordersAged()[1])]).trimEnd().split("\n");
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toMatch(/^1003,\d{4}-\d{2}-\d{2} \d{2}:\d{2},Seller C; Seller D,2,12,42\.51,5\.00,0\.00,1\.79,49\.30,3\.01,46\.29$/);
    expect(lines[2]).toMatch(/,4\.73,1\.25,0\.39,,,,$/);
  });

  test("leaves refunded and net empty when a refund is not stated", () => {
    const r = it.window.MPB.charged(row(ordersAged()[3]), { fees: 26, total: 772, refunded: null, unstated: true });
    expect([r.fees, r.total, r.refunded, r.net]).toEqual([26, 772, null, null]);
  });
});

describe("the order history's panel", () => {
  test("offers a range and Download CSV, this year chosen, and asks for nothing", () => {
    const it = mount();
    expect(it.heading()).toBe("MP BANner");
    expect(it.window.document.querySelector(".ban-year").value).toBe(String(new Date().getFullYear()));
    expect(it.tip()).toBe("Save your orders as CSV, one line per order");
    expect(it.asked).toEqual([]);
  });

  test("All years reads every order, one page of the API at a time, newest first", async () => {
    const it = mount({ limit: 2 });
    it.choose("all");
    it.go();
    await it.settle(80);
    const newest = ordersAged().reverse();
    expect(it.asked).toEqual([...[0, 2, 4, 6].map((o) => "/api/v1/buyer/orders?limit=2&offset=" + o), ...newest.map(dataURL)]);
    const file = await it.file();
    expect(file.name).toBe("mp-orders-all.csv");
    const lines = file.text.trimEnd().split("\n");
    expect(lines[0]).toBe(HEADER);
    expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual(["1006", "1005", "1004", "1003", "1002", "1001"]);
    expect(lines.slice(1).map(amounts)).toEqual(["1006", "1005", "1004", "1003", "1002", "1001"].map((n) => AMOUNTS[n]));
    expect(it.tip()).toBe("Saved mp-orders-all.csv: 6 orders; 1 order has a refund ManaPool does not state, left empty");
    expect(it.heading()).toBe("MP BANner - 6 orders✓");
  });

  test("a year asks from its first day and keeps only its own orders", async () => {
    const it = mount();
    it.choose("2025");
    it.go();
    await it.settle();
    expect(it.asked.length).toBe(3);
    expect(decodeURIComponent(it.asked[0])).toContain("&since=" + new Date(2025, 0, 1).toISOString());
    expect(it.asked.slice(1)).toEqual([ordersAged()[2], ordersAged()[1]].map(dataURL));
    const file = await it.file();
    expect(file.name).toBe("mp-orders-2025.csv");
    expect(file.text.trimEnd().split("\n").slice(1).map((l) => l.split(",")[0])).toEqual(["1003", "1002"]);
  });

  test("the last 30 days keep the orders placed since", async () => {
    const it = mount({ orders: ordersAged([400, 200, 90, 29, 10, 1]) });
    it.choose("days:30");
    it.go();
    await it.settle();
    const file = await it.file();
    expect(file.name).toMatch(/^mp-orders-last-30-days-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.text.trimEnd().split("\n").slice(1).map((l) => l.split(",")[0])).toEqual(["1006", "1005", "1004"]);
  });

  test("keeps only the range, even when the API sends more than was asked", async () => {
    const orders = ordersAged([400, 200, 90, 29, 10, 1]);
    const it = mount({ answer: (url) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ orders }), text: () => Promise.resolve("") }) });
    it.choose("days:30");
    it.go();
    await it.settle();
    expect((await it.file()).text.trimEnd().split("\n").length).toBe(4);
    expect(it.asked.filter((u) => u.endsWith("/__data.json")).length).toBe(3);
  });

  test("an order not whole is left out and counted", async () => {
    const orders = ordersAged();
    orders[5].total_cents = null;
    const it = mount({ orders });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.tip()).toBe("Saved mp-orders-all.csv: 5 orders; 1 order unreadable, left out; 1 order has a refund ManaPool does not state, left empty");
  });

  test("a history with no order it can read fails, and does not say it has none", async () => {
    const orders = ordersAged().map((o) => ({ ...o, total_cents: null }));
    const it = mount({ orders });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.heading()).toMatch(/^MP BANner - 6 unreadable/);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Nothing saved: 6 orders could not be read");
    expect(it.saved).toEqual([]);
  });

  test("an order it cannot read outside an empty range is said, not a failure", async () => {
    const orders = ordersAged([400, 200, 100, 90, 80, 70]);
    orders[0].total_cents = null;
    const it = mount({ answer: () => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ orders }) }) });
    it.choose("days:30");
    it.go();
    await it.settle();
    expect(it.heading()).toBe("MP BANner - no orders✓");
    expect(it.tip()).toBe("No orders in that range; 1 order unreadable, left out");
  });

  test("a range with none says so, and saves nothing", async () => {
    // The fixture's one 2024 order is left out.
    const none = mount({ orders: ordersAged().slice(1) });
    none.choose("2024");
    none.go();
    await none.settle();
    expect(none.heading()).toBe("MP BANner - no orders✓");
    expect(none.tip()).toBe("No orders in that range");
    expect(none.saved).toEqual([]);
  });

  test("a visitor ManaPool has not signed in is told to sign in", async () => {
    const it = mount({ answer: () => Promise.resolve({ ok: false, status: 401, headers: { get: () => null }, json: () => Promise.resolve({}) }) });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
    expect(it.saved).toEqual([]);
  });

  test("an answer with no orders list is refused, not read as none", async () => {
    const it = mount({ answer: () => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ error: "x" }) }) });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("ManaPool answered with no orders list");
  });

  test("an order page that does not read leaves its charges empty and is counted", async () => {
    const orders = ordersAged();
    const failed = JSON.stringify({ type: "error", error: { message: "Internal Error" } });
    const it = mount({ pages: pages((p, id) => (id === orders[5].id ? "<html>not data</html>" : id === orders[0].id ? failed : p)) });
    it.choose("all");
    it.go();
    await it.settle(80);
    const lines = (await it.file()).text.trimEnd().split("\n");
    expect(amounts(lines[1])).toBe("48.57,5.40,0.00,,,,");
    expect(amounts(lines[6])).toBe("1.98,1.25,0.16,,,,");
    expect(it.tip()).toBe("Saved mp-orders-all.csv: 6 orders; 1 order has a refund ManaPool does not state, left empty; the charges of 2 orders could not be read, left empty");
  });

  test("an order page answered 401 asks the visitor to sign in, and nothing is saved", async () => {
    const orders = ordersAged();
    const it = mount({ pages: pages((p, id) => (id === orders[4].id ? 401 : p)) });
    it.choose("all");
    it.go();
    await it.settle(80);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
    expect(it.saved).toEqual([]);
  });

  test("an order page refused stops the read and says so, and nothing is saved", async () => {
    const orders = ordersAged();
    const it = mount({ pages: pages((p, id) => (id === orders[2].id ? null : p)) });
    it.choose("all");
    it.go();
    await it.settle(80);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toMatch(/404/);
    expect(it.saved).toEqual([]);
  });

  test("an order page that sends the visitor to sign in stops the read, and nothing is saved", async () => {
    const orders = ordersAged();
    const redirect = JSON.stringify({ type: "redirect", location: "/auth?next=%2Fsettings%2Forders%2F" + orders[3].id });
    const it = mount({ pages: pages((p, id) => (id === orders[3].id ? redirect : p)) });
    it.choose("all");
    it.go();
    await it.settle(80);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Sign in to ManaPool to read your orders");
    expect(it.saved).toEqual([]);
  });

  test("counts the order pages as it reads them, and waits the pace before each", async () => {
    const it = mount();
    it.window.MPB.PACE = 1000;
    it.choose("all");
    it.go();
    await it.settle(60);
    expect(it.asked.length).toBe(1);
    expect(it.heading()).toBe("MP BANner - order 1 of 6");
    await it.settle(1000);
    expect(it.asked.length).toBe(2);
    expect(it.asked[1]).toBe(dataURL(ordersAged()[5]));
    expect(it.heading()).toBe("MP BANner - order 2 of 6");
    await it.settle(500);
    expect(it.asked.length).toBe(2);
    it.escape();
  });

  test("Escape while the order pages are read stops it, and nothing is saved", async () => {
    const it = mount();
    it.window.MPB.PACE = 1000;
    it.choose("all");
    it.go();
    await it.settle(1100);
    expect(it.asked.length).toBe(2);
    it.escape();
    await it.settle(3000);
    expect(it.asked.length).toBe(2);
    expect(it.busy()).toBe(false);
    expect(it.saved).toEqual([]);
  });

  test("waits the pace before each page after the first", async () => {
    const it = mount({ limit: 2 });
    it.window.MPB.PACE = 1000;
    it.choose("all");
    it.go();
    await it.settle(60);
    expect(it.asked.length).toBe(1);
    it.escape();
  });

  test("Escape stops the read, and nothing is saved", async () => {
    const it = mount({ answer: () => new Promise(() => {}) });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.busy()).toBe(true);
    it.escape();
    expect(it.busy()).toBe(false);
    expect(it.failed()).toBe(false);
    expect(it.saved).toEqual([]);
  });
});

describe("following ManaPool's own navigation", () => {
  test("no panel off the order history, and one on arriving there with no load", async () => {
    const it = mount({ path: "/cards" });
    expect(it.shown()).toBe(false);
    it.visit("/settings/orders");
    await it.settle(600);
    expect(it.shown()).toBe(true);
    expect(it.window.document.querySelector(".ban-year") === null).toBe(false);
    // An order's own page swaps the history's panel for the order's.
    it.visit("/settings/orders/3e28cf57-6020-47e1-89ca-f4ee167de083");
    await it.settle(600);
    expect(it.window.document.querySelector(".ban-year") === null).toBe(true);
    expect(it.window.document.querySelector(".ban-send") === null).toBe(false);
    it.visit("/cards");
    await it.settle(600);
    expect(it.shown()).toBe(false);
  });

  test("leaving mid-read stops it, and nothing is saved", async () => {
    let answered = null;
    const fixture = pages();
    const it = mount({
      answer: (url) => {
        const id = /\/settings\/orders\/([0-9a-f-]{36})\/__data\.json$/.exec(url);
        if (id) return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(pageBody(fixture[id[1]])) });
        return new Promise((done) => (answered = done));
      },
    });
    it.choose("all");
    it.go();
    await it.settle();
    it.visit("/cards");
    await it.settle(600);
    answered({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({ orders: ordersAged() }) });
    await it.settle();
    expect(it.shown()).toBe(false);
    expect(it.saved).toEqual([]);
  });

  test("puts the panel back when ManaPool's redraw takes it", async () => {
    const it = mount();
    it.window.document.getElementById("ban-panel").remove();
    await it.settle(600);
    expect(it.shown()).toBe(true);
  });
});
