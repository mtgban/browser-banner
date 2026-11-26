// An order page's data as ManaPool's server sends it to the page: SvelteKit's
// __data.json, one line of nodes and then a line per promise it resolves.
// The page's own node is the fourth, after the layouts', and every value in
// it is flattened into one array of references, Maps and Dates headed by
// their names, as the real answers are.

import { text } from "./panel.js";

// Later stands for a promise the page resolves in a later line.
class Later {
  constructor(id) {
    this.id = id;
  }
}

// flatten writes value as SvelteKit does: every value once in an array, the
// first the root, each reference an index into it.
export function flatten(root) {
  const values = [];
  const seen = new Map();
  function add(v) {
    if (v === undefined) return -1;
    if (v !== null && typeof v === "object" && seen.has(v)) return seen.get(v);
    const i = values.length;
    values.push(null);
    if (v === null || typeof v !== "object") {
      values[i] = v;
      return i;
    }
    seen.set(v, i);
    if (v instanceof Later) {
      values[i] = ["Promise", add(v.id)];
    } else if (v instanceof Date) {
      values[i] = ["Date", v.toISOString()];
    } else if (v instanceof Map) {
      const entries = ["Map"];
      values[i] = entries;
      for (const [k, x] of v) entries.push(add(k), add(x));
    } else if (Array.isArray(v)) {
      values[i] = v.map(add);
    } else {
      const o = {};
      values[i] = o;
      for (const k of Object.keys(v)) o[k] = add(v[k]);
    }
    return i;
  }
  add(root);
  return values;
}

// pageBody is the body of one order page's data, from the fixture's
// { order, reports, gatheredOrderReports? }.
export function pageBody(page) {
  const root = {
    title: "Order - " + page.order.buyerLabelNumber + " - Mana Pool",
    order: { ...page.order, createdAt: new Date(page.order.createdAt) },
    sellerOrders: [],
    orderItemsBySellerDetailsId: new Later(1),
    orderReportsBySellerOrderId: new Map(Object.entries(page.reports)),
    hubRoutedSellerOrderIds: [],
    gatheredOrder: null,
    gatheredOrderReports: page.gatheredOrderReports || [],
  };
  const first = { type: "data", nodes: [{ type: "skip" }, { type: "skip" }, null, { type: "data", data: flatten(root), uses: { params: ["id"] } }] };
  const chunk = { type: "chunk", id: 1, data: flatten(new Map()) };
  return JSON.stringify(first) + "\n" + JSON.stringify(chunk) + "\n";
}

// pages is the fixture's order pages by the order's id, each page's data
// as fix(page) leaves it.
export function pages(fix = (p) => p) {
  const all = JSON.parse(text("pages.json"));
  return Object.fromEntries(Object.entries(all).map(([id, page]) => [id, fix(page, id)]));
}
