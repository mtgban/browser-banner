// The order list: its pages, the orders opened one at a time, and the CSV.

import { test, expect, describe } from "bun:test";
import { mount, listPages, orderOf, orderPage, LIST, ORDER } from "./panel.js";

const HEADER = "Order Number,Order Date,Status,Items,Refunded,Subtotal,Discount,Shipping,Tax,Total";

const lines = async (it) => (await it.file()).text.trimEnd().split("\n");
const numbers = async (it) => (await lines(it)).slice(1).map((l) => l.split(",")[0]);

describe("a page of the list", () => {
  const it = mount();

  test("is every order on it, by number and date", () => {
    const read = it.SCGB.readList(it.window.document);
    expect(read.unreadable).toBe(0);
    expect(read.orders.map((o) => o.id)).toEqual(Array.from({ length: 10 }, (_, i) => String(1000001 + i)));
    expect(read.orders[1].date).toEqual({ year: 2026, month: 11, day: 2 });
    expect(read.orders[6].date).toEqual({ year: 2025, month: 12, day: 31 });
  });

  test("counts an order with no number or no date", () => {
    const own = mount();
    own.window.document.querySelector(".order-title a").setAttribute("href", "/account.php?action=view_order");
    own.window.document.querySelectorAll(".order-date p")[1].textContent = "yesterday";
    expect(own.SCGB.readList(own.window.document).unreadable).toBe(2);
  });

  test("a date is a day of a month, or none", () => {
    const { date } = it.SCGB;
    expect(date(" May 3rd 2026 ")).toEqual({ year: 2026, month: 5, day: 3 });
    expect(date("Jan 22nd 2026")).toEqual({ year: 2026, month: 1, day: 22 });
    for (const bad of ["Feb 30th 2026", "Foo 1st 2026", "May 3 2026", "", "May 0th 2026"]) {
      expect(date(bad)).toBe(null);
    }
  });
});

describe("an order's line", () => {
  const it = mount();
  const date = { year: 2026, month: 11, day: 9 };
  const csv = (o) => it.SCGB.historyCSV([it.SCGB.orderRow(o, date)]).trimEnd().split("\n");

  test("is what the order cost, refunded copies neither counted nor charged", () => {
    expect(csv(orderOf("1000001"))).toEqual([HEADER, "1000001,2026-11-09,Awaiting fulfillment,4,3,338.42,16.92,8.87,0.00,330.37"]);
    expect(csv(orderOf("1000002"))[1]).toBe("1000002,2026-11-09,Shipped,4,2,991.48,0.00,10.34,0.00,1001.82");
  });

  test("does not count the free line for shipping a buyer's cards back", () => {
    const o = orderOf("1000002");
    o.items.push({ quantity: 2, sku: "BUYER-RETURN", refunded: false, refunded_qty: 0, price: { value: 0 } });
    expect(csv(o)[1]).toBe("1000002,2026-11-09,Shipped,4,2,991.48,0.00,10.34,0.00,1001.82");
  });

  test("is zeros for an order refunded whole", () => {
    const o = orderOf("1000002");
    o.status = "4";
    o.status_text = "Refunded";
    expect(csv(o)[1]).toBe("1000002,2026-11-09,Refunded,0,6,0.00,0.00,0.00,0.00,0.00");
  });

  test("leaves the amounts empty when they are not known", () => {
    const o = orderOf("1000002");
    o.total_rows.push({ label: "Handling", value: { value: 1 } });
    expect(csv(o)[1]).toBe("1000002,2026-11-09,Shipped,4,2,,,,,");
  });

  test("is null for an order with no items, no status, or an unreadable count", () => {
    const { orderRow } = it.SCGB;
    expect(orderRow({ ...orderOf("1000002"), items: [] }, date)).toBe(null);
    expect(orderRow({ ...orderOf("1000002"), items: null }, date)).toBe(null);
    expect(orderRow({ ...orderOf("1000002"), status_text: "" }, date)).toBe(null);
    const o = orderOf("1000002");
    o.items[0].quantity = "two";
    expect(orderRow(o, date)).toBe(null);
  });
});

describe("the order in a page", () => {
  const it = mount();
  const doc = (html) => new it.window.DOMParser().parseFromString(html, "text/html");

  test("is read from what the page boots with", () => {
    expect(it.SCGB.orderIn(doc(orderPage(orderOf("1000001"))), "1000001").items.length).toBe(5);
  });

  test("is refused when there is none, it does not read, or it is another", () => {
    const { orderIn, NO_ORDER } = it.SCGB;
    expect(() => orderIn(doc("<h1>Sign in</h1>"), "1000001")).toThrow(NO_ORDER);
    expect(() => orderIn(doc('<script>stencilBootstrap("account_order", "{")</script>'), "1000001")).toThrow(NO_ORDER);
    expect(() => orderIn(doc(orderPage(orderOf("1000001"))), "1000002")).toThrow(NO_ORDER);
  });
});

describe("the history's panel", () => {
  test("offers the recent days, every year, and the years, this one chosen", () => {
    const it = mount();
    expect(it.heading()).toBe("SCG BANner");
    const options = [...it.window.document.querySelectorAll(".ban-year option")].map((o) => o.value);
    expect(options.slice(0, 5)).toEqual(["days:30", "days:90", "days:120", "all", String(new Date().getFullYear())]);
    expect(options[options.length - 1]).toBe("1995");
    expect(it.window.document.querySelector(".ban-year").value).toBe(String(new Date().getFullYear()));
    expect(it.asked).toEqual([]);
  });

  test("a year opens each of its orders, one at a time, and saves one line each", async () => {
    const it = mount({ orders: { 1000001: orderPage(orderOf("1000001")) } });
    it.choose("2026");
    it.go();
    await it.done();
    expect(it.asked).toEqual([1, 2, 3, 4, 5, 6].map((n) => ORDER + (1000000 + n)));
    expect((await it.file()).name).toBe("scg-orders-2026.csv");
    const out = await lines(it);
    expect(out[0]).toBe(HEADER);
    expect(out[1]).toBe("1000001,2026-11-19,Awaiting fulfillment,4,3,338.42,16.92,8.87,0.00,330.37");
    expect(out.length).toBe(7);
    expect(it.heading()).toBe("SCG BANner - 6 orders✓");
    expect(it.tip()).toBe("Saved scg-orders-2026.csv: 6 orders");
  });

  test("the walk ends at the first order older than the range", async () => {
    const it = mount({ pages: listPages(3) });
    it.choose("2026");
    it.go();
    await it.done();
    expect(it.asked.filter((u) => u.includes("order_status"))).toEqual([2, 3].map((n) => LIST + "&limit=10&page=" + n));
    expect(await numbers(it)).toEqual([1, 2, 3, 4, 5, 6].map((n) => String(1000000 + n)));
  });

  test("every year reads the list to its last page", async () => {
    const it = mount({ pages: listPages(4) });
    it.choose("all");
    it.go();
    await it.done();
    expect(it.asked.filter((u) => u.includes("order_status")).length).toBe(2);
    expect((await numbers(it)).length).toBe(10);
  });

  test("recent days are counted back from today", async () => {
    const it = mount({ pages: listPages(10, [0, 5, 29, 30, 31, 60, 200, 300, 400, 500]) });
    it.choose("days:30");
    it.go();
    await it.done();
    expect(await numbers(it)).toEqual(["1000001", "1000002", "1000003", "1000004"]);
    expect((await it.file()).name).toMatch(/^scg-orders-last-30-days-\d{4}-\d\d-\d\d\.csv$/);
  });

  test("a read started on a later page starts from the first", async () => {
    const it = mount({ path: LIST + "&limit=10&page=2", pages: listPages(5) });
    it.choose("all");
    it.go();
    await it.done();
    expect(it.asked[0]).toBe(LIST + "&limit=10&page=1");
    expect((await numbers(it)).length).toBe(10);
  });

  test("a next link back to a page already read ends the walk", async () => {
    const pages = listPages(5);
    pages[1] = pages[1].replace('<ul class="pagination-c-nav">', '<ul class="pagination-c-nav"><li class="pagination-c-item--next"><a href="' + LIST + '&amp;limit=10&amp;page=2">next</a></li>');
    const it = mount({ pages, answer: () => (it.asked.length > 30 ? Promise.reject(new Error("still walking")) : null) });
    it.choose("all");
    it.go();
    await it.done();
    expect(it.asked.filter((u) => u.includes("order_status")).length).toBe(1);
    expect((await numbers(it)).length).toBe(10);
  });

  test("waits PACE before each request after the first", async () => {
    const it = mount();
    it.window.SCGB.PACE = 1000;
    it.choose("2026");
    it.go();
    await it.settle(60);
    expect(it.asked.length).toBe(1);
    it.escape();
  });

  test("an order with no amounts is in the file, named with the reason", async () => {
    const o = orderOf("1000002");
    o.total_rows.push({ label: "Handling", value: { value: 1 } });
    const it = mount({ orders: { 1000002: orderPage(o) } });
    it.choose("2026");
    it.go();
    await it.done();
    expect((await lines(it))[2]).toBe("1000002,2026-11-02,Shipped,4,2,,,,,");
    expect(it.tip()).toBe('Saved scg-orders-2026.csv: 6 orders; no amounts for 1000002 (a "Handling" line)');
  });

  test("an unreadable order is counted and left out, from the list or its own page", async () => {
    const o = orderOf("1000002");
    o.items = [];
    const pages = listPages();
    pages[0] = pages[0].replace("Nov 19th 2026", "soon");
    const it = mount({ pages, orders: { 1000002: orderPage(o) } });
    it.choose("2026");
    it.go();
    await it.done();
    expect(await numbers(it)).toEqual([3, 4, 5, 6].map((n) => String(1000000 + n)));
    expect(it.tip()).toBe("Saved scg-orders-2026.csv: 4 orders; 2 orders unreadable, left out");
  });

  test("a range with no order it can read fails, and does not say it has none", async () => {
    const pages = listPages().map((p) => p.replace(/[A-Z][a-z]{2} \d{1,2}(?:st|nd|rd|th) \d{4}/g, "soon"));
    const it = mount({ pages });
    it.choose("2022");
    it.go();
    await it.done();
    expect(it.heading()).toMatch(/^SCG BANner - 10 unreadable/);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Nothing saved: 10 orders could not be read");
    expect(it.saved).toEqual([]);
  });

  test("an order it cannot read outside an empty range is said, not a failure", async () => {
    const pages = listPages();
    pages[0] = pages[0].replace("Nov 19th 2026", "soon");
    const it = mount({ pages });
    it.choose("2022");
    it.go();
    await it.done();
    expect(it.heading()).toBe("SCG BANner - no orders✓");
    expect(it.tip()).toBe("No orders in that range; 1 order unreadable, left out");
  });

  test("a range whose orders' own pages do not read fails", async () => {
    const o = orderOf("1000002");
    o.items = [];
    const it = mount({ pages: listPages(10, [5, 200, 210, 220, 230, 240, 250, 260, 270, 280]), orders: { 1000001: orderPage({ ...o, id: 1000001 }) } });
    it.choose("days:30");
    it.go();
    await it.done();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Nothing saved: 1 order could not be read");
  });

  test("a range with no orders saves nothing", async () => {
    const it = mount();
    it.choose("2022");
    it.go();
    await it.done();
    expect(it.saved).toEqual([]);
    expect(it.tip()).toBe("No orders in that range");
  });

  test("a page with no list, or an order's with no order, says to sign in and saves nothing", async () => {
    const it = mount();
    it.window.document.querySelector(".orders-list").remove();
    it.go();
    await it.done();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Star City Games answered with no order list; sign in and try again");
    const other = mount({ orders: { 1000003: "<h1>Sign in</h1>" } });
    other.choose("2026");
    other.go();
    await other.done();
    expect(other.failed()).toBe(true);
    expect(other.tip()).toBe("Star City Games answered with no order; sign in and try again");
    expect(other.saved).toEqual([]);
  });

  test("a challenge stops the read and saves nothing", async () => {
    const it = mount({
      answer: () => Promise.resolve({ ok: false, status: 403, headers: { get: () => "challenge" }, text: () => Promise.resolve("") }),
    });
    it.choose("2026");
    it.go();
    await it.done();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Star City Games is checking the browser; reload and try again");
    expect(it.asked.length).toBe(1);
    expect(it.saved).toEqual([]);
  });

  test("Escape stops the read, and nothing more is asked or saved", async () => {
    let answered = null;
    const it = mount({ answer: () => new Promise((done) => (answered = done)) });
    it.choose("2026");
    it.go();
    await it.settle();
    expect(it.busy()).toBe(true);
    it.escape();
    expect(it.busy()).toBe(false);
    answered({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(orderPage(orderOf("1000001"))) });
    await it.settle();
    expect(it.asked.length).toBe(1);
    expect(it.failed()).toBe(false);
    expect(it.saved).toEqual([]);
  });
});

describe("a run stopped", () => {
  const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(body) });

  test("Escape during the wait asks nothing more", async () => {
    const it = mount();
    it.window.SCGB.PACE = 60;
    it.choose("2026");
    it.go();
    await it.settle(30);
    it.escape();
    await it.settle(120);
    expect(it.asked.length).toBe(1);
  });

  test("Escape on the last order saves nothing", async () => {
    let answered = null;
    const pages = listPages();
    const it = mount({ pages, answer: (url) => (url.endsWith("1000010") ? new Promise((done) => (answered = done)) : null) });
    it.choose("2023");
    it.go();
    await it.settle();
    answered(ok(orderPage({ ...orderOf("1000002"), id: 1000010 })));
    it.escape();
    await it.settle();
    expect(it.saved).toEqual([]);
    expect(it.heading()).toBe("SCG BANner");
  });
});

test("no panel on the account's other pages", () => {
  for (const path of ["/account.php?action=address_book", "/account.php", ORDER + "abc"]) {
    expect(mount({ path, pages: ["<h1>Addresses</h1>"] }).shown()).toBe(false);
  }
});
