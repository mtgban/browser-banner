# AGENTS.md

Guidance for AI coding agents working on ManaPool's part of **BANner**, the
browser extension: it saves a ManaPool buyer's order history as CSV, one
line per order. Read `SPECIFICATIONS.md` for what it does and what is known
about ManaPool; this file is about how to work on it without breaking it.

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
src/history.js   an order to its line, its sellers' suborders folded in
src/page.js      content script: follows the address, the history's panel
tests/panel.js   stands the script up in a window; the API from the fixture
tests/mutations.json  each guard, the text that breaks it, the test that fails
tests/           bun + happy-dom, no browser
```

## Verifying

From the repository's root:

```
bun install
bun run test
bun run mutate sites/manapool
```

## Rules

- **ManaPool moves between pages without loading them.** The script runs on
  every ManaPool page and follows `location.pathname`; a panel belongs to a
  path, and leaving the path takes it away and stops what it started.
- **One request at a time, PACE apart.** The API answers 100 orders at once,
  so a whole history is a request or two; it is still never fanned out.
- **Amounts are the API's own.** ManaPool's page adds its service fee to
  an order's total; the API does not give it, and it is not computed here.

## Commits

One topic per commit, wrapped at 80 columns, with the reasoning in the body
rather than the diff. No `Co-Authored-By` lines.
