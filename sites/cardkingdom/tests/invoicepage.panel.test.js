// The panel on a sell invoice: Load prices, then CSV and BAN with each
// line's Scryfall id from the list.

import { test, expect, describe } from "bun:test";
import { CKB, text } from "./helpers.js";
import { mountCart } from "./panel.js";

const PATH = "/myaccount/po_invoice/3000001";
const HEADER = "Scryfall ID,Name,Edition,Foil,Condition,Quantity,Price,Total,CK ID";

// invoiceBody is the invoice's list with some rows dropped.
function invoiceBody(drop = []) {
  const body = JSON.parse(text("invoice-pricelist.json"));
  body.data = body.data.filter((r) => !drop.includes(r.id));
  return body;
}

const mount = (options = {}) =>
  mountCart({ path: PATH, body: text("sell-invoice.html"), prices: invoiceBody(), ...options });

async function loaded(options) {
  const it = await mount(options);
  it.button().click();
  await it.idle();
  return it;
}

describe("the sell invoice's panel", () => {
  test("offers Load prices, with CSV and BAN greyed out until a list is in hand", async () => {
    const it = await mount();
    expect(it.heading()).toBe("CK BANner");
    expect(it.button().textContent).toBe("Load prices");
    expect(it.csv().disabled).toBe(true);
    expect(it.ban().disabled).toBe(true);
    expect(it.ban().getAttribute("aria-label")).toBe("Send to BAN");
    expect(it.tip()).toBe("Give this order's cards their Scryfall ids from Card Kingdom's price list, read once and kept for an hour");
    it.csv().click();
    it.ban().click();
    expect(it.saved()).toEqual([]);
    expect(it.tabs).toEqual([]);
  });

  test("reads the list once, keeps it, and says every line was found", async () => {
    const it = await loaded();
    expect(it.asked.length).toBe(1);
    expect(it.heading()).toBe("CK BANner - 6 lines✓");
    expect(it.ticked()).toBe(true);
    expect(it.tip()).toBe("6 of 6 lines found in the price list");
    expect(it.csv().disabled).toBe(false);
    expect(it.ban().disabled).toBe(false);
    expect(await it.kept()).not.toBe(null);
  });

  test("says how many lines the list does not have, and how many it could not read", async () => {
    const body = text("sell-invoice.html").replace("1 EX @ $14.00", "1 EX at $14.00");
    const it = await loaded({ body, prices: invoiceBody([65154]) });
    expect(it.heading()).toBe("CK BANner - 5 lines✓");
    expect(it.tip()).toBe(
      "4 of 5 lines found in the price list; 1 line not in the price list, with no Scryfall id; 1 line unreadable, left out",
    );
  });

  test("uses a fresh kept list at once, with no request", async () => {
    const it = await mount({ kept: CKB.reducePrices(invoiceBody(), Date.now()) });
    expect(it.asked).toEqual([]);
    expect(it.tip()).toBe("6 of 6 lines found in the price list");
    expect(it.csv().disabled).toBe(false);
  });

  test("CSV saves the lines with their ids, named for the order", async () => {
    const it = await loaded();
    it.csv().click();
    const file = await it.file();
    expect(file.name).toBe("ck-sale-3000001.csv");
    const rows = file.text.trimEnd().split("\n");
    expect(rows[0]).toBe(HEADER);
    expect(rows.length).toBe(7);
    expect(rows.every((r, i) => i === 0 || /^[0-9a-f-]{36},/.test(r))).toBe(true);
  });

  test("BAN hands the CSV's rows to mtgban once it is listening", async () => {
    const it = await loaded();
    it.ban().click();
    expect(it.tabs[0].url).toBe("https://mtgban.com/upload/handoff");
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the order");
    it.ready();
    await it.settle();
    const posted = it.tabs[0].posted[0];
    expect(posted.origin).toBe("https://mtgban.com");
    expect(posted.data.rows).toBe(6);
    expect(posted.data.source).toBe("https://www.cardkingdom.com" + PATH);
    expect(posted.data.csv).toBe(CKB.invoiceCSV(CKB.readSellInvoice(it.window.document).lines, CKB.reducePrices(invoiceBody(), Date.now())));
    expect(it.tip()).toBe("Sent 6 lines to BAN");
    expect(it.ticked()).toBe(true);
  });

  test("a blocked pop-up is a red cross saying so", async () => {
    const it = await loaded({ blockPopups: true });
    it.ban().click();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("The upload page was blocked; allow pop-ups here and try again");
  });

  test("Escape stops the read and leaves the panel as it was", async () => {
    const it = await mount({ respond: () => {} });
    it.button().click();
    await it.settle();
    expect(it.busy()).toBe(true);
    it.escape();
    await it.settle();
    expect(it.busy()).toBe(false);
    expect(it.failed()).toBe(false);
    expect(it.csv().disabled).toBe(true);
    expect(await it.kept()).toBe(null);
  });

  test("a read that fails says why, and keeps CSV greyed out", async () => {
    const it = await mount({ respond: (_, reject) => reject(new Error("Card Kingdom did not answer in time")) });
    it.button().click();
    await it.idle();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("Card Kingdom did not answer in time");
    expect(it.csv().disabled).toBe(true);
  });

  test("stays off a page with no invoice lines, or no invoice", async () => {
    const empty = await mount({ body: '<h1>My Account / Order #3000001</h1> <table class="table orderContents"><tbody></tbody></table>' });
    expect(empty.panel).toBe(null);
    const none = await mount({ body: "<h1>My Account / Order #3000001</h1>" });
    expect(none.panel).toBe(null);
  });
});

describe("the purchase invoice's panel", () => {
  const BOUGHT = "/myaccount/invoice/4000001";
  const purchaseBody = () => JSON.parse(text("purchase-pricelist.json"));
  const mountPurchase = (options = {}) =>
    mountCart({ path: BOUGHT, body: text("purchase-invoice.html"), prices: purchaseBody(), ...options });

  test("says how many lines the list has, and saves them named for the order", async () => {
    const it = await mountPurchase();
    expect(it.csv().disabled).toBe(true);
    it.button().click();
    await it.idle();
    expect(it.heading()).toBe("CK BANner - 7 lines✓");
    expect(it.tip()).toBe("6 of 7 lines found in the price list; 1 line not in the price list, with no Scryfall id");
    it.csv().click();
    const file = await it.file();
    expect(file.name).toBe("ck-purchase-4000001.csv");
    expect(file.text.trimEnd().split("\n").length).toBe(8);
  });

  test("BAN hands the CSV's rows to mtgban", async () => {
    const it = await mountPurchase();
    it.button().click();
    await it.idle();
    it.ban().click();
    it.ready();
    await it.settle();
    const posted = it.tabs[0].posted[0];
    expect(posted.data.rows).toBe(7);
    expect(posted.data.csv).toBe(
      CKB.purchaseCSV(CKB.readPurchaseInvoice(it.window.document).lines, CKB.reducePrices(purchaseBody(), Date.now())),
    );
  });
});
