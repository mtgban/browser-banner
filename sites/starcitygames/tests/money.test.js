// What an order cost, worked out of its own lines.

import { test, expect, describe } from "bun:test";
import { mount, orderOf } from "./panel.js";

const it = mount();
const cost = (o) => it.SCGB.cost(o);
const cut = (id, change) => {
  const o = orderOf(id);
  change(o);
  return o;
};
const row = (o, label) => o.total_rows.find((r) => r.label === label).value;
const refund = (o, i, n) => {
  o.items[i].refunded_qty = n;
  o.items[i].refunded = n === o.items[i].quantity;
};
const unrefunded = (o) => o.items.forEach((x, i) => refund(o, i, 0));

describe("an order's cost", () => {
  test("is what it came to before store credit, with nothing refunded", () => {
    expect(cost(cut("1000001", unrefunded))).toEqual({ subtotal: 56339, discount: 2817, shipping: 887, tax: 0, total: 54409 });
  });

  test("is the copies kept, at what each was bought for, and the shipping", () => {
    expect(cost(orderOf("1000002"))).toEqual({ subtotal: 99148, discount: 0, shipping: 1034, tax: 0, total: 100182 });
  });

  test("leaves a refund's share of the discount out with it", () => {
    // 544.09 paid, 213.72 refunded: 3 x 71.24, as the page prints it.
    expect(cost(orderOf("1000001"))).toEqual({ subtotal: 33842, discount: 1692, shipping: 887, tax: 0, total: 33037 });
  });

  test("is nothing for an order refunded whole, shipping included", () => {
    const o = cut("1000001", (x) => x.items.forEach((item, i) => refund(x, i, item.quantity)));
    expect(cost(o)).toEqual({ subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 });
  });

  test("is nothing for an order refunded, cancelled or declined by its status", () => {
    for (const status of ["4", "5", "6"]) {
      expect(cost(cut("1000002", (o) => (o.status = status))).total).toBe(0);
    }
    expect(cost(cut("1000002", (o) => (o.status = "14"))).total).toBe(100182);
  });

  test("an item marked refunded is refunded whole, whatever its count says", () => {
    const o = cut("1000002", (x) => (x.items[0].refunded = true));
    expect(cost(o).total).toBe(100182 - 23999);
  });

  test("carries the tax of an order with no refund", () => {
    const o = cut("1000001", (x) => {
      unrefunded(x);
      row(x, "Tax").value = 10;
      row(x, "Store Credit").value = -554.09;
    });
    expect(cost(o)).toEqual({ subtotal: 56339, discount: 2817, shipping: 887, tax: 1000, total: 55409 });
  });

  test("is what it came to whatever was left to pay", () => {
    const o = cut("1000002", (x) => {
      row(x, "Store Credit").value = -1000;
      row(x, "Grand total").value = 2351.8;
    });
    expect(cost(o).total).toBe(100182);
  });

  test("is what was paid with nothing refunded, though its lines are a cent off it", () => {
    const o = cut("1000001", (x) => {
      unrefunded(x);
      row(x, "Store Credit").value = -544.07;
    });
    expect(cost(o)).toEqual({ subtotal: 56339, discount: 2817, shipping: 887, tax: 0, total: 54407 });
  });

  test("takes a discount off line by line, each rounded on its own", () => {
    // 10% of 1.05 twice is 0.11 twice, and of 2.10 at once 0.21.
    const o = cut("1000001", (x) => {
      x.items = x.items.slice(0, 3);
      x.items.forEach((item, i) => {
        item.quantity = 1;
        item.price.value = i < 2 ? 1.05 : 2;
        refund(x, i, i === 2 ? 1 : 0);
      });
      row(x, "Subtotal").value = 4.1;
      row(x, "Coupon Code (EXAMPLE)").value = -0.42;
      row(x, "Store Credit").value = -12.55;
    });
    expect(cost(o)).toEqual({ subtotal: 210, discount: 22, shipping: 887, tax: 0, total: 1075 });
  });

  test("is nothing for an order refunded whole but for the free line shipping it back", () => {
    const o = cut("1000001", (x) => {
      x.items.forEach((item, i) => refund(x, i, item.quantity));
      x.items.push({ quantity: 1, sku: "BUYER-RETURN", refunded: false, refunded_qty: 0, price: { value: 0 } });
    });
    expect(cost(o).total).toBe(0);
  });

  test("an order of that free line alone came to what was paid for it", () => {
    const o = cut("1000002", (x) => {
      x.items = [{ quantity: 1, sku: "BUYER-RETURN", refunded: false, refunded_qty: 0, price: { value: 0 } }];
      row(x, "Subtotal").value = 0;
      row(x, "Store Credit").value = -10.34;
    });
    expect(cost(o)).toEqual({ subtotal: 0, discount: 0, shipping: 1034, tax: 0, total: 1034 });
  });
});

describe("a cost not known", () => {
  test("a refund on a taxed order: its share of the tax is not known", () => {
    const o = cut("1000002", (x) => {
      row(x, "Tax").value = 10;
      row(x, "Store Credit").value = -3361.8;
    });
    expect(cost(o)).toEqual({ why: "a refund on a taxed order" });
  });

  test("a refund under a discount that is not a whole percent", () => {
    const o = cut("1000001", (x) => {
      row(x, "Coupon Code (EXAMPLE)").value = -20;
      row(x, "Store Credit").value = -552.26;
    });
    expect(cost(o)).toEqual({ why: "a refund under a discount that is not a whole percent" });
  });

  test("a discount that could be more than one percent is none of them", () => {
    // A cent off fifty is one percent, two, or three by rounding.
    const o = cut("1000001", (x) => {
      x.items = [x.items[1]];
      x.items[0].price.value = 0.1;
      x.items[0].quantity = 5;
      x.items[0].refunded_qty = 1;
      x.items[0].refunded = false;
      row(x, "Subtotal").value = 0.5;
      row(x, "Coupon Code (EXAMPLE)").value = -0.01;
      row(x, "Store Credit").value = -9.36;
    });
    expect(cost(o)).toEqual({ why: "a refund under a discount that is not a whole percent" });
  });

  test("a line of its totals that is not one of the known ones", () => {
    const o = cut("1000002", (x) => x.total_rows.push({ label: "Gift Certificate", value: { value: 0 } }));
    expect(cost(o)).toEqual({ why: 'a "Gift Certificate" line' });
  });

  test("a refund, on items that do not come to the subtotal, or totals to the grand total", () => {
    const why = { why: "a refund on lines that do not add up" };
    expect(cost(cut("1000002", (o) => o.items.pop()))).toEqual(why);
    expect(cost(cut("1000002", (o) => (row(o, "Shipping").value = 9)))).toEqual(why);
  });

  test("an item or a line with no price", () => {
    expect(cost(cut("1000002", (o) => (o.items[0].price = null)))).toEqual({ why: "an unreadable item" });
    expect(cost(cut("1000002", (o) => (row(o, "Tax").value = "0")))).toEqual({ why: 'a "Tax" line' });
  });

  test("totals with no grand total", () => {
    expect(cost(cut("1000002", (o) => (o.total_rows = o.total_rows.slice(0, 4))))).toEqual({ why: "totals that do not read" });
  });

  test("a discount that adds", () => {
    const o = cut("1000001", (x) => {
      row(x, "Coupon Code (EXAMPLE)").value = 28.17;
      row(x, "Store Credit").value = -600.43;
    });
    expect(cost(o)).toEqual({ why: "totals that do not read" });
  });
});

test("copies refuses a count that is not one", () => {
  const read = (quantity, refunded_qty, refunded = false) => it.SCGB.copies({ quantity, refunded_qty, refunded });
  expect(read(3, 1)).toEqual({ quantity: 3, refunded: 1 });
  for (const bad of [read(0, 0), read(1, 2), read(1.5, 0), read(2, -1), read("2", 0), read(2, undefined)]) {
    expect(bad).toBe(null);
  }
});

test("a price is whole cents or none", () => {
  expect(it.SCGB.cents({ value: 3351.8 })).toBe(335180);
  expect(it.SCGB.cents({ value: 1.005 })).toBe(null);
  expect(it.SCGB.cents({ value: "1.00" })).toBe(null);
});
