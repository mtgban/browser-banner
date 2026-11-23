// Stands Star City Games' content script up the way the browser does: one
// window at an account page, the manifest's scripts in order, evaluated in
// that window. The list and the orders are served from the fixtures;
// everything else that leaves the page is recorded.

import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { siteManifest } from "../../../tests/manifest.js";

const SITE = "https://starcitygames.com";
export const LIST = "/account.php?action=order_status";
export const ORDER = "/account.php?action=view_order&order_id=";

export function text(name) {
  return readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
}

function source(name) {
  return readFileSync(new URL("../" + name, import.meta.url), "utf8");
}

const BOOT = /stencilBootstrap\("account_order", ("(?:[^"\\]|\\.)*")/;

// orderOf is a fixture's order, and orderPage the page that carries one.
export function orderOf(id) {
  return JSON.parse(JSON.parse(BOOT.exec(text("order-" + id + ".html"))[1])).order;
}

export function orderPage(order) {
  return text("order-1000001.html").replace(BOOT, () => 'stencilBootstrap("account_order", ' + JSON.stringify(JSON.stringify({ order })));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// agedDate is the date n days ago, as Star City Games prints one.
function agedDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return MONTHS[d.getMonth()] + " " + d.getDate() + "th " + d.getFullYear();
}

// listPages cuts the fixture's ten orders into pages of size, the next link
// on all but the last; ages, when given, dates the orders that many days ago.
export function listPages(size = 10, ages) {
  const window = new Window({ url: SITE + LIST });
  const read = () => new window.DOMParser().parseFromString(text("list.html"), "text/html");
  const total = Math.ceil(10 / size);
  return Array.from({ length: total }, (_, p) => {
    const doc = read();
    [...doc.querySelectorAll(".orders-list > .account-listItem")].forEach((entry, i) => {
      if (ages) entry.querySelector(".order-date p").textContent = agedDate(ages[i]);
      if (Math.floor(i / size) !== p) entry.remove();
    });
    doc.querySelectorAll(".pagination-c-item--next").forEach((li) => {
      if (p === total - 1) li.remove();
      else li.querySelector("a").setAttribute("href", LIST + "&limit=10&page=" + (p + 2));
    });
    return doc.body.innerHTML;
  });
}

// mount opens path. pages are the list's, orders the order pages' by id, an
// order of the list with none being order 1000002 renumbered; answer(url),
// when given, answers instead where it answers at all.
export function mount({ path = LIST, pages = listPages(), orders = {}, answer, blockPopups } = {}) {
  const window = new Window({ url: SITE + path });
  const asked = [];
  function page(url) {
    const u = new URL(url, SITE);
    if (u.searchParams.get("action") === "order_status") {
      return pages[Number(u.searchParams.get("page") || 1) - 1];
    }
    const id = u.searchParams.get("order_id");
    return orders[id] || orderPage({ ...orderOf("1000002"), id: Number(id) });
  }
  window.document.body.innerHTML = page(path);
  window.fetch = (url) => {
    asked.push(String(url).replace(SITE, ""));
    const own = answer && answer(String(url));
    if (own) return own;
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(page(String(url))) });
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
  // mtgban's handoff tab: what was opened, and what was posted to it.
  const tabs = [];
  window.open = (url) => {
    if (blockPopups) return null;
    const tab = { url, closed: false, posted: [], postMessage: (data, origin) => tab.posted.push({ data, origin }), close: () => (tab.closed = true) };
    tabs.push(tab);
    return tab;
  };
  for (const entry of siteManifest("starcitygames").content_scripts) {
    for (const script of entry.js) {
      window.eval(source(script));
    }
  }
  window.SCGB.PACE = 0;
  const panel = () => window.document.getElementById("ban-panel");
  const at = (s) => panel() && panel().querySelector(s);
  return {
    window,
    SCGB: window.SCGB,
    asked,
    saved,
    tabs,
    ready: (i = 0) =>
      window.dispatchEvent(new window.MessageEvent("message", { data: { type: "mtgban-handoff-ready" }, origin: "https://mtgban.com", source: tabs[i] })),
    send: () => at(".ban-send").click(),
    csv: () => at(".ban-csv").click(),
    shown: () => panel() !== null,
    heading: () => [...at(".ban-label").childNodes].filter((n) => !n.hidden).map((n) => n.textContent).join(""),
    tip: () => at(".ban-tip").textContent,
    choose: (value) => {
      at(".ban-year").value = value;
    },
    go: () => at(".ban-go").click(),
    busy: () => panel().classList.contains("ban-busy"),
    failed: () => !at(".ban-mark").hidden && at(".ban-mark").classList.contains("ban-failed"),
    escape: () => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })),
    file: async () => ({ name: saved[0].name, text: await saved[0].blob.text() }),
    // done waits for a run to end, as long as a long one takes.
    done: async () => {
      for (let i = 0; i < 100 && panel().classList.contains("ban-busy"); i++) {
        await new Promise((resume) => setTimeout(resume, 10));
      }
    },
    settle: (ms = 40) => new Promise((resume) => setTimeout(resume, ms)),
  };
}
