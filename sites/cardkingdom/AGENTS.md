# AGENTS.md

Guidance for AI coding agents working on Card Kingdom's part of **BANner**,
the browser extension: it compares a Card Kingdom sell cart with Card
Kingdom's price list and exports order and selling history as CSV. Read
`SPECIFICATIONS.md` for what it does and what is known about Card Kingdom's
pages; this file is about how to work on it without breaking it.

## The one rule that matters

**Verify against a saved Card Kingdom page, not against the fixture.**

A fixture is a reconstruction, and a reconstruction drifts toward whatever the
code already does. Cardmarket's side of the extension learned this three times:
a parser and its fixture agreed with each other and were both wrong, until a
real page showed it. When you change a parser, ask for a saved page (`Cmd-S`,
complete) and run against it.

**Saved pages are not committable as they are.** A saved cart carries the
signed-in session in every form's `_token`; a saved history page carries the
account's name, email, mailing and shipping addresses, and tracking numbers.
Work on them outside the repository and delete them after. Fixtures are cut by
allowlist, never by editing a saved page down: see `SPECIFICATIONS.md`,
"Fixtures". `tests/repo.test.js` scans every fixture for what a cut must never
keep. A cart fixture holds none of the account's items: the cutter keeps CK's
markup and refills every line with an item drawn from a price list, so it
needs one (`--prices`, the `pricelist.json` CK publishes).

`tests/panel.js` runs a content script the way a tab does: the scripts the
manifest names, in its order, in one happy-dom window at a Card Kingdom
address, with every fetch and download recorded instead of made.

`tests/saved.test.js` runs the parsers on the saved pages themselves, and
checks that none of their order ids reached a fixture:

```
CK_SAVED_ORDERS=<saved order history.html> \
CK_SAVED_SALES=<saved selling history.html> \
CK_SAVED_SELLCART=<saved sell cart.html> \
CK_SAVED_BUYCART=<saved buy cart.html> \
CK_SAVED_SELLINVOICE=<saved sell invoice.html> \
CK_SAVED_PURCHASEINVOICE=<saved purchase invoice.html> \
CK_PRICELIST=<CK's price list, as published> bun test tests/
```

Without the variables it skips. A test that needs a row the saved pages do
not have (another status, a year boundary) edits a copy of a fixture row in
the test itself and says so there; the fixture files stay as cut.

## Layout

```
src/net.js       core/net.js named for Card Kingdom, and the pace
src/money.js     CK's dates to their parts; money is core/money.js's
src/csv.js       the history and cart CSVs' columns; core/csv.js quotes them
src/history.js   history pages: rows, which are exported, the walk, the kept file
src/cart.js      both carts' lines, each read whole or marked unreadable
src/prices.js    the price list: fetch, reduce to arrays by id, look up
src/store.js     the list kept an hour, in IndexedDB or else in memory
src/compare.js   a cart line against the list: the spec's two verdict tables
src/update.js    Update price: the one request, and CK's answer read
src/handoff.js   BAN: core/handoff.js's sender, Magic only, with CK's words
src/cartpage.js  content script: Load prices, the marks, Update price and all
src/cart.css     the marks, four classes deep to outrank CK's own reset
src/ui.js        core/ui.js's panel and download, the panel headed CK
src/historypage.js  content script: range picker (core/ranges.js), Download CSV
src/invoice.js   both invoices' lines, and each one's row in the price list
src/invoicepage.js  content script: Load prices, CSV and BAN on an invoice
src/panel.css    what this panel adds to core/panel.css
scripts/cut-fixtures.py  cuts tests/fixtures/ from saved pages, locally only
tests/mutations.json  each guard, the text that breaks it, the test that fails
tests/           bun + happy-dom, no browser
```

The scripts share one global, `globalThis.CKB`, the way the browser runs
them; `tests/helpers.js` runs them the same way.

The source arrives step by step, in the order `SPECIFICATIONS.md` gives.

## Verifying

From the repository's root:

```
bun install
bun run test
bun run mutate sites/cardkingdom
```

CI runs the same on every push; `bun test tests/` here runs this site's tests
alone, without the repository's own. There is no build step: the scripts are
plain ES5-ish so they can be `content_scripts` entries as they are; keep them
that way.

A guard (a refusal, a strict shape, a check that keeps a write safe) lands
with an entry in `tests/mutations.json`: the text that breaks it and the name
of the test that must then fail. The runner, the repository's
`scripts/mutate.mjs`, runs the whole suite once, then applies each mutation to
a copy of this directory and runs only the test it names; it fails if that
test does not fail, if no test file names it, or if an entry's text no longer
appears exactly once.

## Traps

**Reloading the extension is not enough.** A content script already injected
into an open tab keeps running the old code, so the Card Kingdom tab needs
reloading too.

**A saved page in happy-dom can reach Card Kingdom.** Given a
`www.cardkingdom.com` URL, the window resolves the page's own stylesheet and
script paths against it and fetches them. Strip `<script>`, `<link>`, `<img>`
and `url()` first, give the window no URL, and turn its file loading off.

**Card Kingdom is behind Cloudflare.** Walk history pages one at a time with a
pause before each, never in parallel. A challenge is for the person at the
keyboard: stop, keep nothing, say so, and never try to answer it in code.

**The cart is mounted by Vue.** A re-render can wipe anything inserted into
it, so annotation is idempotent, re-run from a MutationObserver, and every
control checks it still belongs to its line before it acts.

**Never hand `expect` an object holding a DOM node.** A failing `toEqual` or
`toMatchObject` on a cart line (which keeps its wrapper) makes bun print the
whole happy-dom window; the run climbs past 10 GB and never ends. Compare the
plain fields.

**Columns are found by their header.** Ids repeat on every history row, and on
the selling history the status cell's attribute is misspelled `id-=`.

## Things not to do

- **Do not add a permission.** The price list allows any origin and everything
  else is the page's own origin.
- **Do not delete a cart line**, and do not let the cached price list decide a
  write: Card Kingdom's own response is the authority (`SPECIFICATIONS.md`,
  "Update price").
- **Do not write a short export.** A walk that missed a page, or saw the list
  move while it read, writes nothing.
- **Do not guess** a price, an id or a year. A line or row that cannot be read
  honestly is reported, not filled in.
- **Do not resize the panel, or write anything under its buttons.** Status is a
  mark beside the count and a drawn tooltip.
- **Do not write an em dash.** Use a plain dash, a comma or a new sentence; a
  test fails on one.

## Working with the other repositories

The sell cart's add endpoint, its JSON body and the `CartResponse` it returns
are go-mtgban's (`cardkingdom/utils.go`). What the endpoint does to a product
already in the cart is not known; `SPECIFICATIONS.md`, "Update price", says
how the extension copes with either answer. The price
list is the one go-mtgban's CK scraper reads, at the URL go-cardkingdom
publishes. Cardmarket's side is the sibling: share its conventions, not its
code.

Only public repositories are named in this one.

## Commits

One topic per commit; a plain imperative subject with no `area:` prefix,
wrapped at 80 columns; the reason and what was measured in the body. No
`Co-Authored-By` lines. Everything after the scaffold goes through pull
requests off `master`, merged by rebase.
