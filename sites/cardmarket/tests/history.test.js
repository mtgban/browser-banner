// The visitor's purchase history: one line per order, read page by page
// off a purchase list, newest first.

import { test, expect, describe } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { text } from "./helpers.js";
import { clock } from "../../../tests/clock.js";
import { siteManifest } from "../../../tests/manifest.js";

const LIST = "https://www.cardmarket.com/en/Magic/Orders/Purchases/Arrived";

// Each page's orders, in days before today: three pages, newest first.
const AGES = [
  [2, 10, 20, 40, 50],
  [100, 200, 300, 400, 500],
  [800, 900, 1000, 1100, 1200],
];

function dated(age) {
  const d = new Date();
  d.setDate(d.getDate() - age);
  return d;
}

function dmy(d) {
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n) => String(n).padStart(2, "0")).join(".");
}

// page is page n of the list, its orders numbered n*100+k and dated AGES,
// with a next link while there is a next page.
function page(n, pages = AGES.length) {
  let html = text("purchases.html");
  for (let k = 0; k < 5; k++) {
    html = html.split(String(2000001 + k)).join(String(n * 100 + k));
  }
  let k = 0;
  html = html.replace(/<span>\d\d\.\d\d\.\d{4}<\/span>/g, () => "<span>" + dmy(dated(AGES[n - 1][k++])) + "</span>");
  const next = n < pages ? LIST + "?site=" + (n + 1) : "";
  return html.replace(/href="[^"]*site=2"( role="button" aria-label="Next page")/, next ? 'href="' + next + '"$1' : "$1");
}

function mount({ url = LIST, fetchPage } = {}) {
  const window = new Window({ url });
  const time = clock(window);
  window.document.body.innerHTML = page(1);
  const asked = [];
  window.fetch = (href) => {
    asked.push(String(href));
    if (fetchPage) return fetchPage(String(href));
    const n = Number(/site=(\d+)/.exec(String(href))[1]);
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(page(n)) });
  };
  const saved = [];
  window.URL.createObjectURL = (blob) => {
    saved.push({ blob });
    return "blob:none";
  };
  window.URL.revokeObjectURL = () => {};
  const create = window.document.createElement.bind(window.document);
  window.document.createElement = (name, options) => {
    const element = create(name, options);
    if (String(name).toLowerCase() === "a") {
      element.click = function () {
        saved[saved.length - 1].name = this.download;
      };
    }
    return element;
  };
  const fits = (match) => new RegExp("^" + match.replace(/[.?]/g, "\\$&").replace(/\*/g, ".*") + "$").test(url);
  for (const entry of siteManifest("cardmarket").content_scripts.filter((e) => e.matches.some(fits))) {
    for (const script of entry.js) {
      window.eval(readFileSync(new URL("../" + script, import.meta.url), "utf8"));
    }
  }
  window.MKM.PACE = 0;
  const panel = window.document.getElementById("ban-panel");
  const at = (s) => panel.querySelector(s);
  return {
    window,
    panel,
    asked,
    heading: () => [...at(".ban-label").childNodes].filter((n) => !n.hidden).map((n) => n.textContent).join(""),
    tip: () => at(".ban-tip").textContent,
    choose: (value) => {
      at(".ban-year").value = value;
    },
    go: () => at(".ban-save").click(),
    busy: () => panel.classList.contains("ban-busy"),
    failed: () => !at(".ban-mark").hidden && at(".ban-mark").classList.contains("ban-failed"),
    escape: () => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })),
    file: async () => ({ name: saved[0].name, text: await saved[0].blob.text() }),
    saved,
    settle: (ms = 40) => time.settle(ms),
  };
}

describe("reading a purchase list", () => {
  const MKM = () => {
    const it = mount();
    return { MKM: it.window.MKM, doc: it.window.document };
  };

  test("reads every order, the day and time apart, an amount grouped by a full stop", () => {
    const { MKM: mkm } = MKM();
    const w = new Window({ url: LIST });
    w.document.body.innerHTML = text("purchases.html");
    const { orders, unreadable } = mkm.readOrders(w.document);
    expect(unreadable).toBe(0);
    expect(orders.map((o) => [o.id, o.seller, o.quantity, o.amount, o.currency, o.dateText])).toEqual([
      ["2000001", "Seller1", "3", "12.30", "EUR", "14.10.2026 10:00"],
      ["2000002", "Seller2", "1", "4.05", "EUR", "02.10.2026 11:01"],
      ["2000003", "Seller3", "48", "1204.50", "EUR", "30.09.2026 12:02"],
      ["2000004", "Seller4", "1", "0.99", "EUR", "17.09.2026 13:03"],
      ["2000005", "Seller5", "7", "33.10", "EUR", "03.09.2026 14:04"],
    ]);
    expect(orders[0].date).toEqual({ year: 2026, month: 10, day: 14 });
  });

  test("reads a British account's totals, the pound sign first", () => {
    const { MKM: mkm } = MKM();
    const w = new Window({ url: LIST });
    w.document.body.innerHTML = text("purchases.html").replace("4,05 €", "£180.05").replace("1.204,50 €", "£1,204.50");
    const { orders, unreadable } = mkm.readOrders(w.document);
    expect(unreadable).toBe(0);
    expect(orders.slice(1, 3).map((o) => [o.amount, o.currency])).toEqual([["180.05", "GBP"], ["1204.50", "GBP"]]);
  });

  test("counts a row it cannot read whole", () => {
    const { MKM: mkm } = MKM();
    const w = new Window({ url: LIST });
    w.document.body.innerHTML = text("purchases.html").replace("4,05 €", "four euros");
    expect(mkm.readOrders(w.document).unreadable).toBe(1);
  });

  test("writes one line per order under the list's status", () => {
    const { MKM: mkm } = MKM();
    const w = new Window({ url: LIST });
    w.document.body.innerHTML = text("purchases.html");
    const lines = mkm.historyCSV(mkm.readOrders(w.document).orders, "Arrived").split("\r\n");
    expect(lines[0]).toBe("Order ID,Order Status,Date,Seller,Quantity,Amount,Currency");
    expect(lines[3]).toBe("2000003,Arrived,30.09.2026 12:02,Seller3,48,1204.50,EUR");
  });
});

describe("the purchase list's panel", () => {
  test("offers a range and Download CSV, this year chosen", () => {
    const it = mount();
    expect(it.heading()).toBe("CM BANner");
    expect(it.window.document.querySelector(".ban-year").value).toBe(String(new Date().getFullYear()));
    expect(it.tip()).toBe("Save this list's orders as CSV, one line per order");
    expect(it.asked).toEqual([]);
  });

  test("the last 30 days read the page in hand and stop at its first older order", async () => {
    const it = mount();
    it.choose("days:30");
    it.go();
    await it.settle();
    expect(it.asked).toEqual([]);
    const file = await it.file();
    expect(file.name).toMatch(/^cm-purchases-arrived-last-30-days-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.text.trimEnd().split("\r\n").map((l) => l.split(",")[0])).toEqual(["Order ID", "100", "101", "102"]);
    expect(it.tip()).toBe("Saved " + file.name + ": 3 orders. Read 1 page");
    expect(it.heading()).toBe("CM BANner - 3 orders✓");
  });

  test("All years walks every page, one at a time, into one file", async () => {
    const it = mount();
    it.choose("all");
    it.go();
    await it.settle(120);
    expect(it.asked).toEqual([LIST + "?site=2", LIST + "?site=3"]);
    const file = await it.file();
    expect(file.name).toBe("cm-purchases-arrived-all.csv");
    expect(file.text.trimEnd().split("\r\n").length).toBe(16);
    expect(it.tip()).toBe("Saved cm-purchases-arrived-all.csv: 15 orders. Read 3 pages");
  });

  test("writes an order once when a new one pushes it onto the next page", async () => {
    // Page 2 opens with page 1's last order, as it does when an order
    // arrives between the two fetches.
    const ok = (html) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(html) });
    const it = mount({
      fetchPage: (href) => {
        const n = Number(/site=(\d+)/.exec(href)[1]);
        return ok(n === 2 ? page(2).replace(/\/Orders\/200\b/g, "/Orders/104").replace(/>200</g, ">104<") : page(n));
      },
    });
    it.choose("all");
    it.go();
    await it.settle(120);
    const ids = (await it.file()).text.trimEnd().split("\r\n").slice(1).map((l) => l.split(",")[0]);
    expect(ids.filter((id) => id === "104").length).toBe(1);
    expect(ids.length).toBe(14);
  });

  test("writes the NotArrived tab's status as Cardmarket's button says it", async () => {
    const it = mount({ url: LIST.replace("/Arrived", "/NotArrived") });
    it.choose("days:30");
    it.go();
    await it.settle();
    const file = await it.file();
    expect(file.name).toMatch(/^cm-purchases-notarrived-last-30-days-/);
    expect(file.text.split("\r\n")[1].split(",")[1]).toBe("Not arrived");
  });

  test("a year keeps its own orders and stops at the first page past it", async () => {
    // Page 2 spans 400 days, so it always holds an order older than this.
    const year = dated(100).getFullYear();
    const want = AGES.flat().filter((a) => dated(a).getFullYear() === year).length;
    const it = mount();
    it.choose(String(year));
    it.go();
    await it.settle(120);
    const file = await it.file();
    expect(file.name).toBe("cm-purchases-arrived-" + year + ".csv");
    expect(file.text.trimEnd().split("\r\n").length).toBe(1 + want);
    expect(it.asked).not.toContain(LIST + "?site=3");
  });

  test("waits Cardmarket's pace before each page", async () => {
    const it = mount();
    it.window.MKM.PACE = 1000;
    it.choose("all");
    it.go();
    await it.settle(60);
    expect(it.asked).toEqual([]);
    it.escape();
  });

  test("starts from the first page when opened on a later one", async () => {
    const it = mount({ url: LIST + "?site=2" });
    it.choose("days:30");
    it.go();
    await it.settle();
    expect(it.asked).toEqual([LIST]);
  });

  test("Escape stops the walk, and nothing is saved", async () => {
    const it = mount({ fetchPage: () => new Promise(() => {}) });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.busy()).toBe(true);
    it.escape();
    expect(it.busy()).toBe(false);
    expect(it.saved).toEqual([]);
    expect(it.failed()).toBe(false);
  });

  test("a refused page says why, and nothing is saved", async () => {
    const it = mount({ fetchPage: () => Promise.reject(new Error("Cardmarket is checking the browser")) });
    it.choose("all");
    it.go();
    await it.settle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Cardmarket is checking the browser");
    expect(it.saved).toEqual([]);
  });

  test("a list with no order it can read fails, and does not say it has none", async () => {
    const it = mount();
    for (const cell of it.window.document.querySelectorAll("#StatusTable .table-body .col-price")) cell.textContent = "a lot";
    it.window.document.querySelector('[aria-label="Next page"]').removeAttribute("href");
    it.go();
    await it.settle();
    expect(it.heading()).toMatch(/^CM BANner - 5 unreadable/);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Nothing saved: 5 orders could not be read");
    expect(it.saved).toEqual([]);
  });

  test("an order it cannot read outside an empty range is said, not a failure", async () => {
    const it = mount();
    it.window.document.querySelector("#StatusTable .table-body .col-price").textContent = "a lot";
    it.choose(String(dated(1200).getFullYear() - 2));
    it.go();
    await it.settle(120);
    expect(it.heading()).toBe("CM BANner - no orders✓");
    expect(it.tip()).toBe("No orders in that range. Read 3 pages; 1 order unreadable, left out");
  });

  test("an older range with none says so", async () => {
    const it = mount({ fetchPage: (href) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(page(Number(/site=(\d+)/.exec(href)[1]))) }) });
    it.choose(String(dated(1200).getFullYear() - 2));
    it.go();
    await it.settle(120);
    expect(it.heading()).toBe("CM BANner - no orders✓");
    expect(it.tip()).toBe("No orders in that range. Read 3 pages");
    expect(it.saved).toEqual([]);
  });
});
