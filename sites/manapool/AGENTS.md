# AGENTS.md

Guidance for AI coding agents working on ManaPool's part of **BANner**, the
browser extension: it saves a ManaPool buyer's order history as CSV, one
line per order, sends an order's or a package's cards to mtgban's uploader
or saves them as CSV, and in the cart removes a seller's items or sets the
other sellers' aside and puts them back. Read `SPECIFICATIONS.md` for what
it does and what is known about ManaPool; this file is about how to work on
it without breaking it.

The root's `AGENTS.md` holds here too: how to run the tests, the rules, the
traps and the commits. This file says only what is this store's own.

## The one rule that matters

**Verify against ManaPool's real answers, not against the fixture.**

Everything here is read from ManaPool's buyer API, the one go-mtgban's
`cmd/manapoolOrders` reads with a token, asked with the session the page
already has. The fixture is a reconstruction of its answers, and a
reconstruction drifts toward whatever the code already does. When you
change how an answer is read, run the reader on a real one: in a signed-in
ManaPool tab, load the extension, or evaluate `src/` there, and read
`/api/v1/buyer/orders`.

**Real answers are not committable.** They carry the account's order
numbers, the sellers it bought from, what it paid and when. The fixture's
orders are made up in the API's own shape; `tests/repo.test.js` refuses a
fixture with an email, a seller not named `Seller <letter>`, or an order
number not in 1000 to 1999.

## Layout

```
src/ui.js        core/ui.js's panel and download, the panel headed MP
src/api.js       the buyer API: one answer, and every order, PACE apart
src/charges.js   an order's fees and refunds, from its page's own data
src/history.js   an order to its line, its sellers' suborders folded in
src/order.js     an order's detail to one line per card received, and its CSV
src/handoff.js   the link to mtgban's upload that carries an order's cards
src/cart.js      the cart: sellers, an item taken out, listings put back
src/cart.css     the seller buttons, in ManaPool's own page
src/page.js      content script: follows the address, each page's panel
tests/panel.js   stands the script up in a window; the API from the fixture
tests/cart.js    the cart page, and ManaPool's own cart behaviour faked
tests/mutations.json  each guard, the text that breaks it, the test that fails
tests/           bun + happy-dom, no browser
```

## Rules

- **ManaPool moves between pages without loading them.** The script runs on
  every ManaPool page and follows `location.pathname`; a panel belongs to a
  path, and leaving the path takes it away and stops what it started.
- **One request at a time, PACE apart.** The API answers 100 orders at once,
  so a history's list is a request or two; then each order in range has its
  page's data asked for, one after another, never fanned out.
- **The cart is ManaPool's.** Items go out through ManaPool's own quantity
  list, and listings come back as changes in its own stored cart, which it
  syncs. Nothing here posts to ManaPool's server; `tests/cart.js` fakes the
  page's side, so a change there is checked in a real cart first.
- **Amounts are ManaPool's own.** The API gives subtotal, shipping and tax;
  the fees and the refunds are read from the data the order's page loads
  (`src/charges.js`), never computed. A refund ManaPool records without its
  amount leaves Refunded and Net empty, and the panel says how many.
- **Page data carries the session.** The order page's `__data.json` has the
  visitor's session and account in its layout nodes. Only the page's own
  node is read, and a fixture is built in `tests/pages.js` from made-up
  values, never cut from a real answer.
