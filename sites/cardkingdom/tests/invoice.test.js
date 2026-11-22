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
