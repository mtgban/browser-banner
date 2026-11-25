// One of the visitor's own purchases: its articles read off the page, and
// the panel that saves them or sends them to BAN.

import { test, expect, describe } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { MKM, text } from "./helpers.js";
import { clock } from "../../../tests/clock.js";
import { siteManifest } from "../../../tests/manifest.js";

const ORDER = "https://www.cardmarket.com/en/Magic/Orders/1000001";

function docOf(html) {
  const window = new Window({ url: ORDER });
  window.document.body.innerHTML = html;
  return window.document;
}

const read = (html = text("purchase.html")) => MKM.parsePurchase(docOf(html));

describe("reading a purchase", () => {
  test("reads every article in the page's order, as an offer is read", () => {
    const { cards, skipped } = read();
    expect(skipped).toBe(0);
    expect(cards.length).toBe(10);
    expect(cards[1]).toEqual({
      mcmID: "243",
      cardName: "Slagwurm Armor",
      edition: "Mirrodin",
      expansionName: "Mirrodin",
      condition: "MP",
      foil: "foil",
      quantity: "1",
      articleID: cards[1].articleID,
      language: "1",
      languageName: "English",
      price: "0.39",
      currency: "eur",
      url: "https://www.cardmarket.com/en/Magic/Products/Singles/Mirrodin/Slagwurm-Armor?language=1&minCondition=4&utm_source=MTGBAN&utm_medium=text&utm_campaign=card_prices",
    });
    expect(cards.map((c) => [c.cardName, c.condition, c.foil, c.quantity])).toEqual([
      ["Questing Phelddagrif", "MP", "", "1"],
      ["Slagwurm Armor", "MP", "foil", "1"],
      ["Bishop of Wings", "NM", "", "1"],
      ["Mycoloth", "NM", "", "1"],
      ["Gilt-Leaf Palace", "NM", "", "1"],
      ["Corpsejack Menace", "NM", "", "2"],
      ["Athreos, Shroud-Veiled", "NM", "", "1"],
      ["Pollywog Symbiote", "NM", "", "1"],
      ["Isochron Scepter", "NM", "", "1"],
      ["Maul of the Skyclaves (V.2)", "NM", "foil", "1"],
    ]);
  });

  test("takes the set from the product link, as the offers' edition column does", () => {
    const pollywog = read().cards[7];
    expect(pollywog.edition).toBe("Ikoria Lair of Behemoths Extras");
    expect(pollywog.expansionName).toBe("Ikoria: Lair of Behemoths: Extras");
  });

  test("leaves out an altered, signed or inked card, and a row it cannot read, and counts them", () => {
    const html = text("purchase.html")
      .replace('data-bs-original-title="Foil"', 'data-bs-original-title="Signed"')
      .replace('data-amount="2"', 'data-amount="two"');
    const { cards, skipped } = read(html);
    expect(skipped).toBe(2);
    expect(cards.map((c) => c.cardName)).not.toContain("Slagwurm Armor");
    expect(cards.map((c) => c.cardName)).not.toContain("Corpsejack Menace");
  });

  test("reads an article once, however many times it is drawn", () => {
    const html = text("purchase.html");
    const row = /<tr data-article-id=[\s\S]*?<\/tr>/.exec(html)[0];
    expect(read(html.replace(row, row + row)).cards.length).toBe(10);
  });

  test("writes the offers' CSV", () => {
    const cards = read().cards.map((c) => ({ ...c, priceUSD: MKM.priceUSD(c.price, c.currency, { eur: 1.1 }) }));
    const lines = MKM.toCSV(cards).split("\r\n");
    expect(lines[0]).toBe("mcm_id,card_name,edition,condition,foil,quantity,price_usd,mkm_language,article_id,mkm_notes");
    expect(lines[2]).toBe("243,Slagwurm Armor,Mirrodin,MP,foil,1,0.43,English," + cards[1].articleID + "," + cards[1].url);
  });
});

// mount stands the order page up as the browser does, every content script
// in manifest order; rates answers the exchange-rate feed or refuses it.
function mount({ url = ORDER, body = text("purchase.html"), rates = { usd: { eur: 0.9 } } } = {}) {
  const window = new Window({ url });
  const time = clock(window);
  window.document.body.innerHTML = body;
  const opened = [];
  window.open = (href) => {
    opened.push(href);
    opened.tab = { closed: false, posted: [], postMessage: (data, origin) => opened.tab.posted.push({ data, origin }), close() {} };
    return opened.tab;
  };
  const asked = [];
  window.fetch = (href) => {
    asked.push(String(href));
    return rates ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rates) }) : Promise.reject(new Error("offline"));
  };
  const saved = [];
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
        saved[saved.length - 1].name = this.download;
      };
    }
    return element;
  };
  // Only the entries whose pattern fits the address, as the browser runs them.
  const fits = (match) => new RegExp("^" + match.replace(/[.?]/g, "\\$&").replace(/\*/g, ".*") + "$").test(url);
  for (const entry of siteManifest("cardmarket").content_scripts.filter((e) => e.matches.some(fits))) {
    for (const script of entry.js) {
      window.eval(readFileSync(new URL("../" + script, import.meta.url), "utf8"));
    }
  }
  const panel = window.document.getElementById("ban-panel");
  const at = (s) => panel && panel.querySelector(s);
  return {
    window,
    panel,
    opened,
    asked,
    heading: () => [...at(".ban-label").childNodes].filter((n) => !n.hidden).map((n) => n.textContent).join(""),
    tip: () => at(".ban-tip").textContent,
    send: () => at(".ban-send"),
    save: () => at(".ban-save"),
    failed: () => !at(".ban-mark").hidden && at(".ban-mark").classList.contains("ban-failed"),
    file: async () => ({ name: saved[0].name, text: await saved[0].blob.text() }),
    ready: () =>
      window.dispatchEvent(Object.assign(new window.Event("message"), { source: opened.tab, origin: "https://mtgban.com", data: { type: "mtgban-handoff-ready" } })),
    settle: (ms = 30) => time.settle(ms),
  };
}

describe("the purchase's panel", () => {
  test("counts the cards, and asks for nothing until clicked", () => {
    const it = mount();
    expect(it.heading()).toBe("CM BANner - 11 cards");
    expect(it.tip()).toBe("Save this order's 10 articles as CSV, or send them to BAN");
    expect(it.asked).toEqual([]);
    expect(it.send().disabled).toBe(false);
    expect(it.save().textContent).toBe("CSV");
  });

  test("CSV saves the articles with their prices in dollars, named for the order", async () => {
    const it = mount();
    it.save().click();
    await it.settle();
    const file = await it.file();
    expect(file.name).toBe("cm-purchase-1000001.csv");
    const lines = file.text.trimEnd().split("\r\n");
    expect(lines.length).toBe(11);
    expect(lines[2]).toContain(",Slagwurm Armor,Mirrodin,MP,foil,1,0.43,English,");
    expect(it.tip()).toBe("Saved cm-purchase-1000001.csv");
  });

  test("with no exchange rate, saves anyway and says the prices are empty", async () => {
    const it = mount({ rates: null });
    it.save().click();
    await it.settle();
    expect((await it.file()).text.split("\r\n")[2]).toContain(",MP,foil,1,,English,");
    expect(it.tip()).toBe("Saved cm-purchase-1000001.csv; 10 prices left empty: no exchange rate");
  });

  test("Send to BAN opens the game's upload at once and hands it the CSV's rows", async () => {
    const it = mount();
    it.send().click();
    expect(it.opened[0]).toBe("https://mtgban.com/upload/handoff");
    expect(it.tip()).toBe("Waiting for mtgban's upload page to take the order");
    await it.settle();
    it.ready();
    await it.settle();
    const posted = it.opened.tab.posted[0];
    expect(posted.origin).toBe("https://mtgban.com");
    expect(posted.data.rows).toBe(10);
    expect(posted.data.source).toBe(ORDER);
    expect(posted.data.csv.split("\r\n")[0]).toBe("mcm_id,card_name,edition,condition,foil,quantity,price_usd,mkm_language,article_id,mkm_notes");
    expect(it.tip()).toBe("Sent 10 articles to BAN");
  });

  test("says what was left out", async () => {
    const it = mount({ body: text("purchase.html").replace('data-bs-original-title="Foil"', 'data-bs-original-title="Altered"') });
    expect(it.heading()).toBe("CM BANner - 10 cards");
    it.save().click();
    await it.settle();
    expect(it.tip()).toBe("Saved cm-purchase-1000001.csv; 1 article left out: altered, signed, inked or unreadable");
  });

  test("offers no send for a game BAN does not price", () => {
    const it = mount({ url: "https://www.cardmarket.com/en/Digimon/Orders/1000001" });
    expect(it.send().disabled).toBe(true);
    expect(it.save().disabled).toBe(false);
  });

  test("stays off the purchase lists, and off an order with no articles", () => {
    // Compared as booleans: a failing match on an element prints the page.
    expect(mount({ url: "https://www.cardmarket.com/en/Magic/Orders/Purchases/Arrived" }).panel === null).toBe(true);
    expect(mount({ body: "<h1>Purchase</h1>" }).panel === null).toBe(true);
  });
});
