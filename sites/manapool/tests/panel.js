// Stands ManaPool's content script up the way the browser does: one window at
// a ManaPool address, the manifest's scripts in order, evaluated in that
// window. The buyer API is served from the fixture, honouring limit, offset
// and since; everything else that leaves the page is recorded.

import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { siteManifest } from "../../../tests/manifest.js";

const SITE = "https://manapool.com";

export function text(name) {
  return readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
}

function source(name) {
  return readFileSync(new URL("../" + name, import.meta.url), "utf8");
}

// ordersAged is the fixture's orders, each placed ages[i] days ago when
// ages is given.
export function ordersAged(ages) {
  const orders = JSON.parse(text("orders.json")).orders;
  if (ages) {
    orders.forEach((o, i) => {
      const d = new Date();
      d.setDate(d.getDate() - ages[i]);
      o.created_at = d.toISOString();
    });
  }
  return orders;
}

// mount opens path with orders behind the API, served oldest first in
// pages of the asked limit. answer(url), when given, answers instead.
export function mount({ path = "/settings/orders", orders = ordersAged(), order, answer, limit, page, activation = true } = {}) {
  const window = new Window({ url: SITE + path });
  window.document.body.innerHTML = page || "<main><h1>Orders</h1></main>";
  Object.defineProperty(window.navigator, "userActivation", { value: activation === null ? undefined : { isActive: activation }, configurable: true, writable: true });
  const asked = [];
  window.fetch = (url) => {
    asked.push(String(url));
    if (answer) return answer(String(url));
    const u = new URL(String(url), SITE);
    const one = /^\/api\/v1\/buyer\/orders\/([0-9a-f-]{36})$/.exec(u.pathname);
    if (one) {
      const body = order || JSON.parse(text("order.json"));
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });
    }
    const since = u.searchParams.get("since");
    const from = Number(u.searchParams.get("offset") || 0);
    const size = Number(u.searchParams.get("limit") || 100);
    const sorted = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const kept = since ? sorted.filter((o) => new Date(o.created_at) >= new Date(since)) : sorted;
    const body = JSON.stringify({ orders: kept.slice(from, from + size) });
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(JSON.parse(body)) });
  };
  const saved = [];
  // The links clicked: mtgban's upload, with what its fragment carries.
  const links = [];
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
        if (this.download) {
          saved[saved.length - 1].name = this.download;
        } else {
          links.push({ url: this.href, target: this.target, rel: this.rel, referrer: this.referrerPolicy || this.getAttribute("referrerpolicy"), placed: this.isConnected });
        }
      };
    }
    return element;
  };
  for (const entry of siteManifest("manapool").content_scripts) {
    for (const script of entry.js) {
      window.eval(source(script));
    }
  }
  window.MPB.PACE = 0;
  if (limit) window.MPB.LIMIT = limit;
  const panel = () => window.document.getElementById("ban-panel");
  const at = (s) => panel() && panel().querySelector(s);
  return {
    window,
    asked,
    saved,
    links,
    sent: (i = 0) => JSON.parse(decodeURIComponent(links[i].url.split("#mtgban-handoff-rows=")[1])),
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
    // visit moves the page to path as ManaPool's own links do, with no load.
    visit: (to) => window.history.pushState({}, "", SITE + to),
    settle: (ms = 40) => new Promise((done) => setTimeout(done, ms)),
    close: () => window.happyDOM.abort().then(() => window.close()),
  };
}
