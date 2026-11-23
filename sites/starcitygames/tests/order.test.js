// An order's page: its cards, as CSV or sent to BAN.

import { test, expect, describe } from "bun:test";
import { mount, orderOf, orderPage, ORDER } from "./panel.js";

const HEADER = "Name,Set,Number,Finish,Condition,Language,Quantity,Price,SKU";

describe("an order's cards", () => {
  const it = mount();
  const read = (o) => it.SCGB.orderLines(o);
  const one = (change) => {
    const o = orderOf("1000002");
    o.items = [o.items[0]];
    change(o.items[0]);
    return read(o);
  };

  test("are one line per card kept, at what each copy was paid, as the page prints it", () => {
    const r = read(orderOf("1000001"));
    expect(r.lines.map((l) => [l.name, l.set, l.number, l.finish, l.condition, l.language, l.quantity, l.price])).toEqual([
      ["Daze", "Nemesis", "30", "Foil", "SP", "EN", 1, 31349],
      ["Raffine, Scheming Seer", "Streets of New Capenna - Variants", "327", "Nonfoil", "NM", "EN", 1, 569],
      ["Void Rend", "SNC", "Prerelease 230", "Foil", "SP", "EN", 1, 113],
      ["Caves of Koilos", "DMU", "Promo Pack 244", "Nonfoil", "NM", "EN", 1, 119],
    ]);
    expect(r.left).toEqual({ refunded: 3, games: 0, sealed: 0, unreadable: 0 });
    expect(r.unpriced).toBe(0);
  });

  test("leave out the copies refunded, and keep the rest of the line", () => {
    const r = read(orderOf("1000002"));
    expect(r.lines.map((l) => [l.name, l.quantity, l.price])).toEqual([
      ["Shivan Reef", 1, 23999],
      ["City of Brass", 1, 74999],
      ["Bounce Chamber", 2, 75],
    ]);
    expect(r.left.refunded).toBe(2);
  });

  test("are none of a refunded order's", () => {
    const o = orderOf("1000002");
    o.status = 4;
    expect(read(o).lines).toEqual([]);
    expect(read(o).left.refunded).toBe(6);
  });

  test("leave out another game's, and what is not a single", () => {
    expect(one((i) => (i.sku = "SGL-LOR-TFC-1-ENN1")).left.games).toBe(1);
    expect(one((i) => ((i.sku = "SLD-MTG-BOX"), (i.quantity = 3))).left.sealed).toBe(3);
  });

  test("count a refunded copy as refunded, whatever it is a copy of", () => {
    const r = one((i) => Object.assign(i, { sku: "SLD-MTG-BOX", quantity: 2, refunded_qty: 2, refunded: true }));
    expect(r.left).toEqual({ refunded: 2, games: 0, sealed: 0, unreadable: 0 });
  });

  test("count a line whose SKU, finish, condition, name, count or price does not read", () => {
    for (const change of [
      (i) => (i.sku = "SGL-MTG-APC"),
      (i) => (i.sku = null),
      (i) => (i.sku = "SGL-MTG-APC-142-ENX2"),
      (i) => (i.options = [{ name: "Condition", value: "Mint-ish" }]),
      (i) => (i.options = []),
      (i) => (i.name = " [SGL-MTG-APC-142-ENF]"),
      (i) => (i.quantity = 0),
      (i) => (i.price = null),
    ]) {
      const r = one(change);
      expect([r.lines.length, r.left.unreadable]).toEqual([0, 1]);
    }
  });

  test("read every grade, finish and language a SKU carries", () => {
    expect(one((i) => (i.options[0].value = "Heavily Played")).lines[0].condition).toBe("HP");
    expect(one((i) => (i.sku = "SGL-MTG-MSC-008-JAA1")).lines[0]).toMatchObject({ finish: "Foil", language: "JA", number: "008" });
  });

  test("a promo's SKU names its own set and number only where mtgban reads them so", () => {
    const at = (number) => {
      const l = one((i) => (i.sku = "SGL-MTG-PRM-" + number + "-ENF1")).lines[0];
      return [l.set, l.number];
    };
    expect(at("SECRET_SLD_1468")).toEqual(["SLD", "1468"]);
    expect(at("JDG_G02_002")).toEqual(["G02", "002"]);
    expect(at("BUN_MAT_229")).toEqual(["MAT", "229"]);
    expect(at("SCHP_2021_005")).toEqual(["Promo", "SCHP_2021_005"]);
    expect(at("toString_SLD_1")).toEqual(["Promo", "toString_SLD_1"]);
    expect(at("SECRET_1")).toEqual(["Promo", "SECRET_1"]);
  });

  test("a set is the picture's name for it, or the SKU's code without one", () => {
    expect(one((i) => (i.image.alt = "Shivan Reef\nApocalypse")).lines[0].set).toBe("Apocalypse");
    expect(one((i) => (i.image = null)).lines[0].set).toBe("APC");
  });

  test("have no price under a discount that is not a whole percent, or totals not known", () => {
    const o = orderOf("1000001");
    o.total_rows[1].value.value = -20;
    o.total_rows[4].value.value = -552.26;
    expect(read(o).unpriced).toBe(4);
    expect(it.SCGB.orderCSV(read(o).lines).split("\n")[1]).toBe("Daze,Nemesis,30,Foil,SP,EN,1,,SGL-MTG-NEM-30-ENF2");
    const p = orderOf("1000001");
    p.total_rows.push({ label: "Handling", value: { value: 1 } });
    expect(read(p).unpriced).toBe(4);
  });

  test("are at the price the page prints as paid, where it prints one", () => {
    const o = orderOf("1000001");
    o.total_rows[1].value.value = -20;
    o.total_rows[4].value.value = -552.26;
    const entry = (id, sum) =>
      '<li class="account-listItem" data-order_product_id="' + id + '"><div class="actual-price"><div class="product-sum">1 x $9.99</div></div>' +
      '<div class="paid-price"><div class="product-sum">' + sum + "</div></div></li>";
    const doc = new it.window.DOMParser().parseFromString(entry(2000001, "1 x $1,313.49") + entry(2000003, "pending") + '<li class="account-listItem" data-order_product_id="2000004"></li>', "text/html");
    const r = it.SCGB.orderLines(o, it.SCGB.printed(doc));
    expect(r.lines.map((l) => l.price)).toEqual([131349, null, null, null]);
    expect(r.unpriced).toBe(3);
    expect(it.SCGB.orderLines(orderOf("1000001"), it.SCGB.printed(doc)).lines.map((l) => l.price)).toEqual([131349, 569, 113, 119]);
  });

  test("are none of the free line for shipping a buyer's cards back", () => {
    const o = orderOf("1000002");
    o.items.push({ order_product_id: "2000105", quantity: 2, name: "Reshipment for Purchasing [BUYER-RETURN]", sku: "BUYER-RETURN", refunded: false, refunded_qty: 0, price: { value: 0 }, options: null, image: null });
    expect(read(o)).toEqual(read(orderOf("1000002")));
  });

  test("are written under headers mtgban's upload reads, and no other number", () => {
    const csv = it.SCGB.orderCSV(read(orderOf("1000001")).lines).trimEnd().split("\n");
    expect(csv[0]).toBe(HEADER);
    expect(csv[2]).toBe('"Raffine, Scheming Seer",Streets of New Capenna - Variants,327,Nonfoil,NM,EN,1,5.69,SGL-MTG-SNC2-327-ENN1');
  });
});

describe("an order's panel", () => {
  const open = (options = {}) => mount({ path: ORDER + "1000001", orders: { 1000001: orderPage(orderOf("1000001")) }, ...options });

  test("offers Send to BAN and CSV, and asks Star City Games for nothing", async () => {
    const it = open();
    expect(it.heading()).toBe("SCG BANner");
    expect(it.tip()).toBe("Send this order's cards to BAN, or save them as CSV");
    it.csv();
    expect(it.asked).toEqual([]);
    const file = await it.file();
    expect(file.name).toBe("scg-order-1000001.csv");
    expect(file.text.trimEnd().split("\n").length).toBe(5);
    expect(it.heading()).toBe("SCG BANner - 4 cards✓");
    expect(it.tip()).toBe("Saved scg-order-1000001.csv; left out: 3 refunded copies");
  });

  test("Send to BAN opens mtgban's upload on the click and hands it the CSV's rows", () => {
    const it = open();
    it.send();
    expect(it.tabs[0].url).toBe("https://mtgban.com/upload/handoff");
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the order");
    it.ready();
    const posted = it.tabs[0].posted[0];
    expect(posted.origin).toBe("https://mtgban.com");
    expect(posted.data.rows).toBe(4);
    expect(posted.data.source).toBe("https://starcitygames.com" + ORDER + "1000001");
    expect(posted.data.csv.split("\n")[0]).toBe(HEADER);
    expect(it.tip()).toBe("Sent 4 cards to BAN; left out: 3 refunded copies");
  });

  test("an order with no cards to send opens no tab and says why", () => {
    const o = orderOf("1000001");
    o.status = "4";
    const it = open({ orders: { 1000001: orderPage(o) } });
    it.send();
    expect(it.tabs).toEqual([]);
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("No cards to send; left out: 7 refunded copies");
  });

  test("says what it left out and which lines have no price", () => {
    const o = orderOf("1000001");
    o.items[0].sku = "SGL-FAB-AGB-014-ENN1";
    o.items[2].sku = "SUP-UPR-1";
    o.items[3].options = [];
    o.total_rows.push({ label: "Handling", value: { value: 1 } });
    const it = open({ orders: { 1000001: orderPage(o) } });
    it.csv();
    expect(it.tip()).toBe(
      "Saved scg-order-1000001.csv; left out: 3 refunded copies, 1 card of other games, 1 product that is not a single, 1 unreadable line; 1 line without a price",
    );
  });

  test("a page with no order on it, or no items, says to sign in", () => {
    for (const page of ["<h1>Sign in</h1>", orderPage({ ...orderOf("1000001"), items: undefined })]) {
      const it = open({ orders: { 1000001: page } });
      it.csv();
      expect(it.failed()).toBe(true);
      expect(it.tip()).toBe("Star City Games answered with no order; sign in and try again");
      expect(it.saved).toEqual([]);
    }
  });

  test("saves the prices the page has printed", async () => {
    const page = orderPage(orderOf("1000001")) + '<li class="account-listItem" data-order_product_id="2000001"><div class="paid-price"><div class="product-sum">1 x $300.00</div></div></li>';
    const it = open({ orders: { 1000001: page } });
    it.csv();
    expect((await it.file()).text.split("\n")[1]).toBe("Daze,Nemesis,30,Foil,SP,EN,1,300.00,SGL-MTG-NEM-30-ENF2");
  });

  test("a blocked pop-up is a red cross saying so", () => {
    const it = open({ blockPopups: true });
    it.send();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("The upload page was blocked; allow pop-ups here and try again");
  });

  test("Escape gives up waiting for the upload page", () => {
    const it = open();
    it.send();
    it.escape();
    expect(it.tip()).toBe("Send this order's cards to BAN, or save them as CSV");
  });
});
