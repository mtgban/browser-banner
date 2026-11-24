// Stands ManaPool's cart up as far as BANner meets it: the page from the
// fixture, the stored cart in localStorage, and ManaPool's own behaviour
// around them, which the extension drives and does not own:
//
// - a quantity list opens soon after ArrowDown, "remove" highlighted, named
//   by its button's aria-controls, and Enter takes the item out of the stored
//   cart at once and off the page, its list with it, a moment later;
// - a write to the stored cart announced by a storage event is synced: new
//   listings come back under their seller, unless marked sold out.

import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { siteManifest } from "../../../tests/manifest.js";
import { text } from "./panel.js";

const SITE = "https://manapool.com";

export function mountCart({ path = "/cart", refuse = [], noRemove = [], soldOut = [], stash, noSync = false, answer = 2, linger = 80 } = {}) {
  const window = new Window({ url: SITE + path });
  window.document.body.innerHTML = text("cart.html");
  const doc = window.document;
  const lis = [...doc.querySelectorAll("li")];
  // Each item's listing, by its place on the page.
  const listings = lis.map((li, i) => ({ id: "inv-" + (i + 1), li, ul: li.parentElement, name: li.querySelector("h3").textContent.trim() }));
  const store = { version: 5, revision: "r0", cart: { entries: listings.map((l) => ({ inventoryId: l.id, quantitySelected: 1, optimizerTouched: true })) }, changes: [] };
  window.localStorage.setItem("manapool-cart", JSON.stringify(store));
  if (stash) window.localStorage.setItem("banner-manapool-stash", JSON.stringify(stash));

  const read = () => JSON.parse(window.localStorage.getItem("manapool-cart"));
  const write = (s) => window.localStorage.setItem("manapool-cart", JSON.stringify(s));
  let lists = 0;
  doc.addEventListener("keydown", (event) => {
    const box = event.target.closest && event.target.closest('[aria-label="Update Quantity"]');
    if (!box) return;
    const listing = listings.find((l) => l.li === box.closest("li"));
    const open = doc.getElementById(box.getAttribute("aria-controls") || "");
    if (event.key === "ArrowDown" && !open) {
      const list = doc.createElement("div");
      list.setAttribute("role", "listbox");
      list.id = "list-" + ++lists;
      const values = noRemove.includes(listing.name) ? ["1", "2"] : ["0", "1", "2"];
      values.forEach((v, i) => {
        const o = doc.createElement("div");
        o.setAttribute("role", "option");
        o.setAttribute("data-value", v);
        o.textContent = v === "0" ? "remove" : v;
        if (i === 0) o.setAttribute("data-highlighted", "");
        list.appendChild(o);
      });
      setTimeout(() => {
        box.setAttribute("aria-controls", list.id);
        doc.body.appendChild(list);
      }, 3);
    } else if (event.key === "Escape" && open) {
      open.remove();
      box.removeAttribute("aria-controls");
    } else if (event.key === "Enter" && open) {
      const highlighted = open.querySelector("[data-highlighted]");
      box.removeAttribute("aria-controls");
      setTimeout(() => open.remove(), linger);
      if (highlighted.getAttribute("data-value") === "0" && !refuse.includes(listing.name)) {
        setTimeout(() => listing.li.remove(), linger);
        setTimeout(() => {
          const s = read();
          s.cart.entries = s.cart.entries.filter((e) => e.inventoryId !== listing.id);
          write(s);
        }, answer);
      }
    }
  });
  const announced = [];
  window.addEventListener("storage", (event) => {
    if (event.key !== "manapool-cart") return;
    const s = JSON.parse(event.newValue);
    announced.push(s.changes);
    // Out of focus, ManaPool syncs nothing; in focus again, it syncs what
    // the stored cart holds.
    if (noSync) return;
    sync(s);
  });
  const sync = (s) => {
    for (const e of s.cart.entries) {
      const listing = listings.find((l) => l.id === e.inventoryId);
      if (!listing) continue;
      if (soldOut.includes(listing.name)) {
        s.cart.entries = s.cart.entries.filter((x) => x.inventoryId !== e.inventoryId);
      } else if (!listing.li.isConnected) {
        listing.ul.appendChild(listing.li);
      }
    }
    s.changes = [];
    write(s);
  };

  window.URL.createObjectURL = () => "blob:none";
  window.URL.revokeObjectURL = () => {};
  for (const entry of siteManifest("manapool").content_scripts) {
    for (const script of entry.js) {
      window.eval(readFileSync(new URL("../" + script, import.meta.url), "utf8"));
    }
  }
  window.MPB.OPEN = 100;
  window.MPB.WAIT = 200;
  window.MPB.SYNC = 300;
  const panel = () => doc.getElementById("ban-panel");
  const at = (s) => panel() && panel().querySelector(s);
  const sellerRow = (name) => {
    const h3 = [...doc.querySelectorAll("h3")].find((h) => h.textContent.trim() === name);
    return h3 && h3.closest(".justify-between").querySelector(".ban-seller");
  };
  return {
    window,
    doc,
    listings,
    announced,
    // focused is ManaPool's tab coming back into focus, and syncing.
    focused: () => {
      noSync = false;
      sync(read());
    },
    // redraw replaces a seller's items with new nodes, as ManaPool's render
    // may, leaving its header in place.
    redraw: (seller) => {
      for (const l of listings.filter((l) => l.li.isConnected && l.li.closest("div").parentElement.querySelector("h3 a").textContent === seller)) {
        const copy = l.li.cloneNode(true);
        l.li.replaceWith(copy);
        l.li = copy;
      }
    },
    shown: () => panel() !== null,
    word: () => at(".ban-word").textContent,
    tip: () => at(".ban-tip").textContent,
    back: () => at(".ban-go"),
    failed: () => !at(".ban-mark").hidden && at(".ban-mark").classList.contains("ban-failed"),
    rows: () => doc.querySelectorAll(".ban-seller").length,
    press: (seller, label) => [...sellerRow(seller).querySelectorAll("button")].find((b) => b.textContent === label).click(),
    names: () => [...doc.querySelectorAll("li h3")].map((h) => h.textContent.trim()),
    stored: () => read().cart.entries.map((e) => e.inventoryId),
    stash: () => JSON.parse(window.localStorage.getItem("banner-manapool-stash") || "null"),
    escape: () => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })),
    visit: (to) => window.history.pushState({}, "", SITE + to),
    settle: (ms = 60) => new Promise((done) => setTimeout(done, ms)),
  };
}
