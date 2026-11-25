# AGENTS.md

Guidance for AI coding agents working on Star City Games' part of
**BANner**, the browser extension: it saves a buyer's order history as CSV,
one line per order with what the order really came to, and sends an order's
cards to mtgban's uploader or saves them as CSV. Read `SPECIFICATIONS.md`
for what it does and what is known about Star City Games' pages; this file
is about how to work on it without breaking it.

The root's `AGENTS.md` holds here too: how to run the tests, the rules, the
traps and the commits. This file says only what is this store's own.

## The one rule that matters

**Verify against a saved Star City Games page, not against a fixture.**

Run the reader against saved pages:

```
SCG_SAVED="<list.html>:<order.html>:<order.html>" bun test sites/starcitygames
```

`tests/saved.test.js` reads each page, prints what it made of it, and
checks an order's cost against what its own page prints. Without the
variable it skips.

**Saved pages are not committable as they are.** One carries the account's
name, email, phone, postal addresses and a storefront token, all in the JSON
the page boots with. The fixtures are cut by `scripts/cut-fixtures.mjs`,
never by editing a saved page down; `tests/repo.test.js` scans every fixture for what a cut
must never keep.

## Layout

```
src/ui.js        core/ui.js's panel and download, the panel headed SCG
src/read.js      the order list's pages, and the order a page carries
src/money.js     what an order came to: refunds, discount, store credit
src/history.js   an order to its line, and the history CSV
src/order.js     an order's cards, from their SKUs, and their CSV
src/handoff.js   core/handoff.js's sender, Magic only, SCG's words
src/page.js      content script: the list's panel, an order's panel
scripts/cut-fixtures.mjs  cuts tests/fixtures/ from saved pages, locally only
tests/panel.js   stands the script up in a window; pages from the fixtures
tests/mutations.json  each guard, the text that breaks it, the test that fails
tests/           bun + happy-dom, no browser
```

## Rules

- **Read the JSON the page boots with.** What an order's page prints beside
  each card is put there by the store's own script, after asking another
  host; a fetched page has none of it, so a history never reads it, and an
  order's page only where it is there.
- **Take only `order` from that JSON.** The rest is the account.
- **An order's printed total is not its cost.** It is after store credit and
  before refunds. A cost is added up from the order's lines, and only when
  they come to the order's own totals; a line not known leaves it empty.
- **One page at a time, PACE apart.** A history opens every order in range.
