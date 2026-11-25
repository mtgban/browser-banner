# BANner for Card Kingdom

**CK BANner** is a browser extension for Card Kingdom. It works on these
pages:

- **On the sell cart** (`/sellcart`) it checks every line against Card
  Kingdom's public price list and says, next to the line's *Save for Later*,
  whether the list pays more or less than the cart. Where the list pays more,
  *Update price* asks Card Kingdom to reprice that line, and *Update all*,
  under *Empty Cart*, does so for every such line in turn; clicking the
  panel's count takes you to each of them. The list is read once on a click
  and kept for an hour.
- **On the buy cart** (`/cart`) it does the same the other way round: each line
  is checked against the list's price for its condition, and a line the list
  now sells for less is marked as a price drop. Both carts work signed out,
  and either can be saved as a CSV, with each card's Scryfall id, or sent
  to BAN with *BAN*, which hands the same rows to mtgban's upload page in a
  tab of its own.
- **On order and selling history** (`/myaccount/order_history`,
  `/myaccount/selling_history`) you pick a year, or the last 30, 90 or 120
  days, and download a CSV of every paid purchase that shipped, or every paid
  sale that was completed, one row per order in five columns: Order ID, Order
  Status, Order Date, Completed on and Amount. A year's file is kept, so
  asking again while the history has not changed downloads it at once; the
  last days are read afresh each time.
- **On an invoice**, a sale's (`/myaccount/po_invoice/<id>`, from your
  selling history) or a purchase's (`/myaccount/invoice/<id>`, from your
  order history), it saves the order's cards as a CSV, or sends them to
  BAN, each with its Scryfall id from the price list. The tooltip says how
  many cards the list did not have, graded ones among them; they go with
  no id.

## Permissions

None. The price list allows any site to read it, and everything else the
extension reads or sends goes to the Card Kingdom page it is running on, as
the signed-in user. On a click it reads the price list (no cookies sent); on
the history pages it reads the history's own pages one at a time; *Update
price* sends one request per click, and *Update all* one per line, one at a
time. *BAN* opens mtgban's `/upload/handoff` in a tab of its own and
passes it the cart with `postMessage`; that page uploads it with your mtgban
session. Nothing else leaves your browser.

## Installing it

BANner is one extension for every store it reads; install it from the
repository's root, as its README says.

## Developing

From the repository's root:

```
bun install
bun run test
```

`bun test tests/` here runs this site's suite alone, without the
repository's own tests. Read `AGENTS.md` before changing anything.
