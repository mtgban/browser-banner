// BAN on the carts: the rows CSV would save, handed to mtgban's upload in a
// tab of its own.

import { test, expect, describe } from "bun:test";
import { CKB } from "./helpers.js";
import { mountCart, pricelist } from "./panel.js";

const HEADER = "Scryfall ID,Name,Edition,Foil,Condition,Quantity,Price,Total,CK ID";

// loaded is a cart with the list read, so CSV and BAN are ready.
async function loaded(options) {
  const it = await mountCart(options);
  it.button().click();
  await it.idle();
  return it;
}

describe("BAN on the carts", () => {
  test("is greyed out until a list is in hand, like CSV", async () => {
    const it = await mountCart();
    expect(it.ban().textContent).toBe("BAN");
    expect(it.ban().getAttribute("aria-label")).toBe("Send to BAN");
    expect(it.ban().disabled).toBe(true);
    it.ban().click();
    expect(it.tabs).toEqual([]);
    it.button().click();
    await it.idle();
    expect(it.ban().disabled).toBe(false);
  });

  test("is ready on load with a kept list", async () => {
    const it = await mountCart({ kept: CKB.reducePrices(pricelist(), Date.now()) });
    expect(it.ban().disabled).toBe(false);
  });

  test("opens mtgban's handoff and gives it the cart once it is listening", async () => {
    const it = await loaded();
    it.ban().click();
    expect(it.tabs.map((t) => t.url)).toEqual(["https://mtgban.com/upload/handoff"]);
    expect(it.tabs[0].posted).toEqual([]);
    it.ready();
    const [{ data, origin }] = it.tabs[0].posted;
    expect(origin).toBe("https://mtgban.com");
    expect(data.type).toBe("mtgban-handoff-rows");
    expect(data.source).toBe("https://www.cardkingdom.com/sellcart");
    // The same rows CSV saves, Scryfall ids and all.
    it.csv().click();
    expect(data.csv).toBe((await it.file()).text);
    expect(data.csv.split("\n")[0]).toBe(HEADER);
    expect(data.csv.trimEnd().split("\n").length).toBe(1 + data.rows);
    expect(it.ticked()).toBe(true);
    expect(it.tip()).toBe("Sent " + data.rows + " lines to BAN");
  });

  test("sends the buy cart the same way", async () => {
    const it = await loaded({ side: "buy" });
    it.ban().click();
    it.ready();
    expect(it.tabs[0].posted[0].data.source).toBe("https://www.cardkingdom.com/cart");
    expect(it.tabs[0].posted[0].data.csv.split("\n")[0]).toBe(HEADER);
  });

  test("says it is waiting until mtgban's page listens", async () => {
    const it = await loaded();
    it.ban().click();
    expect(it.ticked()).toBe(false);
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the cart");
    // Coming back while the tab is still open changes nothing.
    it.focus();
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the cart");
    it.ready();
    expect(it.ticked()).toBe(true);
  });

  test("listens only to mtgban, from the tab it opened", async () => {
    const it = await loaded();
    it.ban().click();
    it.ready(0, "https://evil.example");
    it.window.dispatchEvent(new it.window.MessageEvent("message", { data: { type: "mtgban-handoff-ready" }, origin: "https://mtgban.com", source: {} }));
    it.window.dispatchEvent(new it.window.MessageEvent("message", { data: { type: "something-else" }, origin: "https://mtgban.com", source: it.tabs[0] }));
    expect(it.tabs[0].posted).toEqual([]);
  });

  test("a BAN tab closed before it listened is noticed on coming back", async () => {
    const it = await loaded();
    it.ban().click();
    it.tabs[0].closed = true;
    it.focus();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("The upload page was closed; try again");
    it.ready();
    expect(it.tabs[0].posted).toEqual([]);
  });

  test("a tab that says it is listening after it was closed gets no lines", async () => {
    const it = await loaded();
    it.ban().click();
    it.tabs[0].closed = true;
    it.ready();
    expect(it.tabs[0].posted).toEqual([]);
    expect(it.tip()).toBe("The upload page was closed; try again");
  });

  test("a second send closes the first tab, which would wait for good", async () => {
    const it = await loaded();
    it.ban().click();
    it.ban().click();
    expect(it.tabs[0].closed).toBe(true);
    expect(it.failed()).toBe(false);
    it.ready(0);
    expect(it.tabs[0].posted).toEqual([]);
    it.ready(1);
    expect(it.tabs[1].posted.length).toBe(1);
    expect(it.tip()).toStartWith("Sent ");
  });

  test("a blocked tab says so", async () => {
    const it = await loaded({ blockPopups: true });
    it.ban().click();
    expect(it.failed()).toBe(true);
    expect(it.tip()).toBe("The upload page was blocked; allow pop-ups here and try again");
  });
});
