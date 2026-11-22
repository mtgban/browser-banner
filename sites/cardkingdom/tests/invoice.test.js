import { test, expect, describe } from "bun:test";
import { CKB, load, docOf, text } from "./helpers.js";

const NOW = 1790000000000;

// invoiceList is the invoice's list with some rows edited or dropped.
function invoiceList(edits = {}, drop = []) {
  const body = JSON.parse(text("invoice-pricelist.json"));
  body.data = body.data.filter((r) => !drop.includes(r.id)).map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r));
  return CKB.reducePrices(body, NOW);
}

const invoice = () => CKB.readSellInvoice(load("sell-invoice.html"));

// line is a line as read, without its order.
const line = (name, edition, foil, condition, qty, each, total) => ({ name, edition, foil, condition, qty, each, total, productID: null });

describe("reading a sell invoice", () => {
  test("reads every line under its edition, foil from the heading", () => {
    expect(invoice()).toEqual({
      lines: [
        line("Liu Bei, Lord of Shu", "Portal 3K", false, "NM", 2, 1900, 3800),
        line("Control of the Court", "Portal 3K", false, "EX", 1, 1400, 1400),
        line("Unnatural Selection", "Apocalypse", true, "NM", 3, 1750, 5250),
        line("Orcus, Prince of Undeath (Extended Art)", "Adventures in the Forgotten Realms Variants", false, "NM", 1, 30, 30),
        line("Rift Bolt (2050 - Foil)", "Secret Lair", false, "NM", 1, 160, 160),
        line("Tainted Pact (Foil Etched - 096 - JPN Alternate Art)", "Strixhaven Mystical Archive JPN", false, "VG", 2, 2400, 4800),
      ],
      unreadable: 0,
    });
  });

  test("reads a name inside a link another extension put there", () => {
    const html = text("sell-invoice.html").replace(
      "<b>Apocalypse Foil</b>",
      '<b><a href="#">Apocalypse</a> Foil</b>',
    ).replace("Liu Bei, Lord of Shu<", '<a href="#">Liu Bei, Lord of Shu</a><');
    const read = CKB.readSellInvoice(docOf(html));
    expect(read.lines[0].name).toBe("Liu Bei, Lord of Shu");
    expect(read.lines[2]).toMatchObject({ edition: "Apocalypse", foil: true });
  });

  test("counts a line it cannot read whole, and keeps the rest", () => {
    const html = text("sell-invoice.html")
      .replace("1 EX @ $14.00", "1 EX at $14.00")
      .replace("<td>$0.30</td>", "<td>$0.31</td>");
    const read = CKB.readSellInvoice(docOf(html));
    expect(read.unreadable).toBe(2);
    expect(read.lines.map((l) => l.name)).not.toContain("Control of the Court");
    expect(read.lines.length).toBe(4);
  });

  test("is null on a page with no invoice table", () => {
    expect(CKB.readSellInvoice(docOf("<h1>My Account</h1>"))).toBe(null);
  });
});

describe("finding an invoice line in the list", () => {
  const found = (list) => invoice().lines.map((l) => {
    const f = CKB.invoiceRow(l, list);
    return f && { id: f.row.id, foil: f.foil };
  });

  test("finds every line, a foil said only by its variation as a foil", () => {
    expect(found(invoiceList())).toEqual([
      { id: 65154, foil: false },
      { id: 65095, foil: false },
      { id: 52031, foil: true },
      { id: 248128, foil: false },
      { id: 313459, foil: true },
      { id: 244371, foil: false },
    ]);
  });

  test("finds nothing for a card the list does not have", () => {
    expect(found(invoiceList({}, [65095]))[1]).toBe(null);
  });

  test("finds nothing where two rows are the same card", () => {
    const body = JSON.parse(text("invoice-pricelist.json"));
    body.data.push({ ...body.data.find((r) => r.id === 65154), id: 99999901, sku: "X-1" });
    expect(found(CKB.reducePrices(body, NOW))[0]).toBe(null);
  });

  test("does not take a variation's Non-Foil for a foil", () => {
    const body = JSON.parse(text("invoice-pricelist.json"));
    const bolt = body.data.find((r) => r.id === 313459);
    bolt.variation = "2050 - Non-Foil";
    const read = invoice();
    read.lines[4].name = "Rift Bolt (2050 - Non-Foil)";
    expect(CKB.invoiceRow(read.lines[4], CKB.reducePrices(body, NOW))).toBe(null);
  });

  test("keeps a heading's foil: a foil line is not found as a plain one", () => {
    expect(found(invoiceList({ 52031: { is_foil: "false" } }))[2]).toBe(null);
  });
});

describe("the invoice's CSV", () => {
  test("is the cart's columns, each line with its Scryfall id, CK id and real foil", () => {
    const rows = CKB.invoiceCSV(invoice().lines, invoiceList()).trimEnd().split("\n");
    expect(rows[0]).toBe("Scryfall ID,Name,Edition,Foil,Condition,Quantity,Price,Total,CK ID");
    expect(rows.length).toBe(7);
    const listed = JSON.parse(text("invoice-pricelist.json")).data;
    const bolt = listed.find((r) => r.id === 313459);
    expect(rows[5]).toBe(bolt.scryfall_id + ",Rift Bolt (2050 - Foil),Secret Lair,Yes,NM,1,1.60,1.60,313459");
    expect(rows[1]).toBe(listed.find((r) => r.id === 65154).scryfall_id + ",\"Liu Bei, Lord of Shu\",Portal 3K,No,NM,2,19.00,38.00,65154");
  });

  test("writes a line the list does not have with no ids", () => {
    const rows = CKB.invoiceCSV(invoice().lines, invoiceList({}, [65095])).trimEnd().split("\n");
    expect(rows[2]).toBe(",Control of the Court,Portal 3K,No,EX,1,14.00,14.00,");
  });
});

// purchaseList is the purchase invoice's list with some rows dropped.
function purchaseList(drop = []) {
  const body = JSON.parse(text("purchase-pricelist.json"));
  body.data = body.data.filter((r) => !drop.includes(r.id));
  return CKB.reducePrices(body, NOW);
}

const purchase = () => CKB.readPurchaseInvoice(load("purchase-invoice.html"));

// bought is a purchase line as read.
const bought = (card, foil, condition, qty, each, total) => ({ card, name: card, edition: "", foil, condition, qty, each, total, productID: null });

describe("reading a purchase invoice", () => {
  test("reads every line of every section, a graded one with no condition", () => {
    expect(purchase()).toEqual({
      lines: [
        bought("Eldrazi Monument: Commander Anthology", false, "NM", 1, 1599, 1599),
        bought("Rafiq of the Many: Double Masters 2022 Foil", true, "NM", 2, 79, 158),
        bought("Sterling Grove (Judge Foil): Promotional", false, "NM", 1, 999, 999),
        bought("Sidequest: Catch a Fish: Final Fantasy", false, "NM", 1, 35, 35),
        bought("Bitter Downfall: The Lord of the Rings: Tales of Middle-earth", false, "NM", 3, 35, 105),
        bought("Torrential Gearhulk: Kaladesh", false, "EX", 2, 103, 206),
        bought("Aang, Air Nomad (Avatar: The Last Airbender Eternal-Legal Foil CGC 8.5) #2171", false, "", 1, 49, 49),
      ],
      unreadable: 0,
    });
  });

  test("counts a purchase line it cannot read whole, and keeps the rest", () => {
    const html = text("purchase-invoice.html")
      .replace("<td>EX</td>", "<td>Played</td>")
      .replace("<td> $1.58</td>", "<td> $1.59</td>")
      .replace("<td>3</td>", "<td>three</td>");
    const read = CKB.readPurchaseInvoice(docOf(html));
    expect(read.unreadable).toBe(3);
    expect(read.lines.length).toBe(4);
  });

  test("a purchase invoice is null on a page with no invoice table", () => {
    expect(CKB.readPurchaseInvoice(docOf("<h1>My Account</h1>"))).toBe(null);
  });
});

describe("finding a purchase line in the list", () => {
  const found = (list) => purchase().lines.map((l) => {
    const f = CKB.purchaseRow(l, list);
    return f && { id: f.row.id, foil: f.foil, name: f.name, edition: f.edition };
  });

  test("splits each card where it is found, whatever colons its name or edition hold", () => {
    expect(found(purchaseList())).toEqual([
      { id: 212627, foil: false, name: "Eldrazi Monument", edition: "Commander Anthology" },
      { id: 263608, foil: true, name: "Rafiq of the Many", edition: "Double Masters 2022" },
      { id: 233901, foil: true, name: "Sterling Grove (Judge Foil)", edition: "Promotional" },
      { id: 313182, foil: false, name: "Sidequest: Catch a Fish", edition: "Final Fantasy" },
      { id: 278212, foil: false, name: "Bitter Downfall", edition: "The Lord of the Rings: Tales of Middle-earth" },
      { id: 208808, foil: false, name: "Torrential Gearhulk", edition: "Kaladesh" },
      null,
    ]);
  });

  test("finds no purchase line for a card the list does not have", () => {
    expect(found(purchaseList([212627]))[0]).toBe(null);
  });

  test("finds nothing where two splits each find a card", () => {
    const body = JSON.parse(text("purchase-pricelist.json"));
    // A made-up card "Sidequest" in an edition "Catch a Fish: Final Fantasy".
    body.data.push({ ...body.data.find((r) => r.id === 313182), id: 99999902, sku: "X-2", name: "Sidequest", edition: "Catch a Fish: Final Fantasy" });
    expect(found(CKB.reducePrices(body, NOW))[3]).toBe(null);
  });
});

describe("the purchase invoice's CSV", () => {
  test("writes each found line split into name and edition, with its ids and real foil", () => {
    const rows = CKB.purchaseCSV(purchase().lines, purchaseList()).trimEnd().split("\n");
    const listed = JSON.parse(text("purchase-pricelist.json")).data;
    const id = (n) => listed.find((r) => r.id === n).scryfall_id;
    expect(rows[0]).toBe("Scryfall ID,Name,Edition,Foil,Condition,Quantity,Price,Total,CK ID");
    expect(rows.length).toBe(8);
    expect(rows[3]).toBe(id(233901) + ",Sterling Grove (Judge Foil),Promotional,Yes,NM,1,9.99,9.99,233901");
    expect(rows[4]).toBe(id(313182) + ",Sidequest: Catch a Fish,Final Fantasy,No,NM,1,0.35,0.35,313182");
    expect(rows[5]).toBe(id(278212) + ",Bitter Downfall,The Lord of the Rings: Tales of Middle-earth,No,NM,3,0.35,1.05,278212");
  });

  test("writes a line it does not find with its card whole and no ids", () => {
    const rows = CKB.purchaseCSV(purchase().lines, purchaseList()).trimEnd().split("\n");
    expect(rows[7]).toBe(",\"Aang, Air Nomad (Avatar: The Last Airbender Eternal-Legal Foil CGC 8.5) #2171\",,No,,1,0.49,0.49,");
  });
});
