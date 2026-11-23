// Saved pages, read whole: SCG_SAVED is their paths, joined by ":". They
// carry an account and are never committed, so without it this skips.

import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { mount, ORDER } from "./panel.js";

const paths = (process.env.SCG_SAVED || "").split(":").filter(Boolean);

const cents = (text) => Math.round(Number(text.replace(/[$,]/g, "")) * 100);

test.skipIf(!paths.length)("every saved page reads", () => {
  const it = mount({ path: ORDER + "abc" });
  for (const path of paths) {
    const text = readFileSync(path, "utf8").replace(/<(svg|style|noscript)\b[\s\S]*?<\/\1>/g, "");
    const doc = new it.window.DOMParser().parseFromString(text, "text/html");
    if (doc.querySelector(".orders-list")) {
      const read = it.SCGB.readList(doc);
      console.log("list", read.orders.length, "orders,", read.unreadable, "unreadable, next", it.SCGB.nextPage(doc, "https://starcitygames.com/account.php"));
      expect(read.unreadable).toBe(0);
      continue;
    }
    const id = /Order #(\d+)/.exec(doc.querySelector(".page-heading").textContent)[1];
    const order = it.SCGB.orderIn(doc, id);
    const row = it.SCGB.orderRow(order, it.SCGB.date(order.date));
    const read = it.SCGB.orderLines(order);
    console.log(row.status, row.items, "kept", row.refunded, "refunded", JSON.stringify(row.cost), JSON.stringify(read.left));
    expect(row.cost.why).toBe(undefined);
    expect(read.unpriced).toBe(0);
    // What the store's own script printed beside each card kept.
    const printed = order.items
      .filter((i) => it.SCGB.copies(i).refunded < i.quantity)
      .map((i) => cents(/x (\S+)/.exec(doc.querySelector('[data-order_product_id="' + i.order_product_id + '"] .paid-price .product-sum').textContent)[1]));
    expect(read.lines.map((l) => l.price)).toEqual(printed);
  }
});
