// An order's fees and refunds, read from the data its page loads.

import { test, expect, describe } from "bun:test";
import { mount, ordersAged } from "./panel.js";
import { flatten, pageBody, pages } from "./pages.js";

const it = mount({ path: "/" });
const chargesOf = (body) => it.window.MPB.chargesOf(body);
const byNumber = Object.fromEntries(ordersAged().map((o) => [o.order_number, o.id]));
const page = (n) => structuredClone(pages()[byNumber[n]]);
const rem = (fields) => ({ refundCents: null, refundExtraMana: null, remedialOrderSellerDetailsId: null, ...fields });
const withRems = (n, ...rems) => {
  const p = page(n);
  p.reports = { [Object.keys(p.reports)[0] || "f6fadfa7-e5c1-4b62-9362-da5cc13da58a"]: [{ proposedRemediation: "refund", remediations: rems }] };
  return p;
};

describe("an order's charges", () => {
  test("are its fees, its total with them, and what its remediations refunded", () => {
    const got = Object.fromEntries(Object.keys(byNumber).map((n) => [n, chargesOf(pageBody(page(n)))]));
    expect(got).toEqual({
      1001: { fees: 0, total: 339, refunded: 0, unstated: false },
      1002: { fees: 20, total: 657, refunded: 150, unstated: false },
      1003: { fees: 179, total: 4930, refunded: 301, unstated: false },
      1004: { fees: 26, total: 772, refunded: null, unstated: true },
      1005: { fees: 1316, total: 14142, refunded: 11817, unstated: false },
      1006: { fees: 204, total: 5601, refunded: 5601, unstated: false },
    });
  });

  test("add cash and Extra Mana, ten Mana to the cent", () => {
    expect(chargesOf(pageBody(withRems("1003", rem({ refundCents: 100, refundExtraMana: 2005 }), rem({ refundExtraMana: 6000 })))).refunded).toBe(100 + 801);
  });

  test("round the Extra Mana once, on its sum", () => {
    expect(chargesOf(pageBody(withRems("1003", rem({ refundExtraMana: 4 }), rem({ refundExtraMana: 4 })))).refunded).toBe(1);
  });

  test("take a remediation that opens a replacement order as no money", () => {
    expect(chargesOf(pageBody(withRems("1003", rem({ remedialOrderSellerDetailsId: "5b0e1d7c-2a4f-4c1e-9d3a-7f6e8b9c0a1d" }))))).toEqual({ fees: 179, total: 4930, refunded: 0, unstated: false });
  });

  test("leave refunded unknown when a remediation states no amount and opens no order", () => {
    expect(chargesOf(pageBody(withRems("1003", rem({ refundCents: 100 }), rem({}))))).toEqual({ fees: 179, total: 4930, refunded: null, unstated: true });
  });

  test("leave refunded unknown when a Gathered order's own reports are there", () => {
    const p = page("1002");
    p.gatheredOrderReports = [{ remediations: [rem({ refundCents: 50 })] }];
    expect(chargesOf(pageBody(p))).toEqual({ fees: 20, total: 657, refunded: null, unstated: true });
  });

  test("refund no more than the order cost, when one refund is written twice", () => {
    expect(chargesOf(pageBody(withRems("1002", rem({ refundCents: 657 }), rem({ refundCents: 657 })))).refunded).toBe(657);
  });

  test("find the page's node by what it holds, not where it sits, and need no later line", () => {
    const body = pageBody(page("1002")).split("\n");
    const first = JSON.parse(body[0]);
    first.nodes = [first.nodes[3], { type: "skip" }];
    expect(chargesOf(JSON.stringify(first))).toEqual({ fees: 20, total: 657, refunded: 150, unstated: false });
  });

  test("answer signed out for a page that sends the visitor to sign in", () => {
    expect(chargesOf(JSON.stringify({ type: "redirect", location: "/auth?next=%2Fsettings%2Forders" }))).toBe("signed out");
    expect(chargesOf(JSON.stringify({ type: "redirect", location: "/settings/orders" }))).toBe(null);
  });

  test("are null for a page that does not read whole", () => {
    const broken = (fix) => {
      const p = page("1002");
      fix(p);
      return chargesOf(pageBody(p));
    };
    expect(chargesOf("")).toBe(null);
    expect(chargesOf("<html></html>")).toBe(null);
    expect(chargesOf(JSON.stringify({ type: "error", error: { message: "Internal Error" } }))).toBe(null);
    expect(chargesOf(JSON.stringify({ type: "data", nodes: [{ type: "data", data: flatten({ title: "Orders" }) }] }))).toBe(null);
    expect(broken((p) => delete p.order.buyerFeeCents)).toBe(null);
    expect(broken((p) => (p.order.gatheredFeeCents = "840"))).toBe(null);
    expect(broken((p) => (p.order.subtotalCents = -1))).toBe(null);
    expect(broken((p) => (Object.values(p.reports)[0][0].remediations = null))).toBe(null);
    expect(broken((p) => (Object.values(p.reports)[0][0].remediations[0].refundCents = 1.5))).toBe(null);
  });

  test("are null for data it cannot rebuild: an unknown kind, a reference past the end", () => {
    const first = JSON.parse(pageBody(page("1002")).split("\n")[0]);
    const data = first.nodes[3].data;
    const orderAt = data[0].order;
    const unknown = structuredClone(first);
    unknown.nodes[3].data[orderAt] = ["Set", 1];
    expect(chargesOf(JSON.stringify(unknown))).toBe(null);
    const past = structuredClone(first);
    past.nodes[3].data[0].order = data.length + 5;
    expect(chargesOf(JSON.stringify(past))).toBe(null);
  });
});
