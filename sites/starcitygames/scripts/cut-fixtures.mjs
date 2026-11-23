// Cuts tests/fixtures/ from saved pages, locally only:
//
//   bun sites/starcitygames/scripts/cut-fixtures.mjs <order list.html> <order.html> ...
//
// The list keeps its markup with made-up order numbers and dates, and no
// pictures. An order keeps what the scripts read and nothing else of what
// the page boots with: its items, totals and status, renumbered, with the
// coupon's code replaced. Every address, name, token and comment goes.

import { Window } from "happy-dom";
import { readFileSync, writeFileSync } from "fs";

const [list, ...orders] = process.argv.slice(2);
const into = new URL("../tests/fixtures/", import.meta.url);

// The list's made-up dates, newest first, as Star City Games prints them.
const DATES = [
  "Nov 19th 2026", "Nov 2nd 2026", "Oct 23rd 2026", "Aug 2nd 2026", "Jul 20th 2026",
  "Jan 1st 2026", "Dec 31st 2025", "May 20th 2025", "Feb 11th 2024", "Mar 12th 2023",
];

function load(path) {
  const window = new Window({ url: "https://starcitygames.com/account.php" });
  return new window.DOMParser().parseFromString(readFileSync(path, "utf8").replace(/<(svg|style|noscript)\b[\s\S]*?<\/\1>/g, ""), "text/html");
}

function cutList(path) {
  const inner = load(path).querySelector(".account-inner");
  inner.querySelectorAll("script, .order-image").forEach((e) => e.remove());
  const entries = [...inner.querySelectorAll(".orders-list > .account-listItem")];
  entries.forEach((entry, i) => {
    const id = String(1000001 + i);
    entry.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", a.getAttribute("href").replace(/order_id=\d+/, "order_id=" + id)));
    entry.querySelector(".order-title a").textContent = "Order #" + id;
    entry.querySelector(".order-description").textContent = i + 1 + " products totaling $0.00";
    entry.querySelector(".order-date p").textContent = DATES[i];
    entry.querySelector(".order-update p").textContent = DATES[i];
  });
  const html = inner.outerHTML.replace(/\n\s*\n+/g, "\n");
  writeFileSync(new URL("list.html", into), html + "\n");
}

function cutOrder(path, n) {
  const text = readFileSync(path, "utf8");
  const boot = /stencilBootstrap\("account_order", ("(?:[^"\\]|\\.)*")/.exec(text);
  const from = JSON.parse(JSON.parse(boot[1])).order;
  const order = {
    id: 1000001 + n,
    status: from.status,
    status_text: from.status_text,
    date: DATES[n],
    payment_method: from.payment_method,
    total: from.total,
    total_rows: from.total_rows.map((r) => ({ label: r.label.replace(/\(.*\)/, "(EXAMPLE)"), value: r.value })),
    items: from.items.map((it, i) => ({
      order_product_id: String(2000001 + n * 100 + i),
      quantity: it.quantity,
      name: it.name,
      sku: it.sku,
      refunded: it.refunded,
      refunded_qty: it.refunded_qty,
      price: it.price,
      total: it.total,
      options: it.options,
      type: it.type,
      image: { alt: it.image.alt },
    })),
  };
  const page =
    '<h2 class="page-heading">Order #' + order.id + "</h2>\n<script>\n            function onThemeBundleMain() {\n" +
    '                window.stencilBootstrap("account_order", ' + JSON.stringify(JSON.stringify({ pageType: "account_order", order })) + ").load();\n" +
    "            }\n</script>\n";
  writeFileSync(new URL("order-" + order.id + ".html", into), page);
}

cutList(list);
orders.forEach(cutOrder);
