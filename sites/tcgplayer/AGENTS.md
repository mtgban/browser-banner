# AGENTS.md

Guidance for AI coding agents working on TCGplayer's part of **BANner**, the
browser extension: it handles a TCGplayer buyer's order history: a year,
every year or the last days saved as CSV, every order number made a search
for that order, and an order's cards sent to mtgban's uploader. Read
`SPECIFICATIONS.md` for what it does and what is known about TCGplayer's
page; this file is about how to work on it without breaking it.

The root's `AGENTS.md` holds here too: how to run the tests, the rules, the
traps and the commits. This file says only what is this store's own.

## The one rule that matters

**Verify against a saved TCGplayer page, not against the fixture.**

Run the reader against a saved page:

```
TCG_SAVED_ORDERS="<saved order history.html>" bun test tests/
```

`tests/saved.test.js` reads every order on it, prints the lines it could not
read whole, and checks none of its order numbers reached a fixture. Without
the variable it skips.

**Saved pages are not committable as they are.** One carries the account's
email (the welcome line), name, two postal addresses, tracking numbers, the
filter form's `__RequestVerificationToken`, and every seller it bought from.
The fixture is cut by `scripts/cut-fixtures.mjs`, never by editing a saved
page down; `tests/repo.test.js` scans every fixture for what a cut must never
keep.

## Layout

```
src/money.js     "November 09, 2026" to parts, counts; money is core/money.js's
src/csv.js       the orders and cards CSVs' columns; core/csv.js quotes them
src/read.js      a page: the filter, the list's heading, every order and line
src/net.js       core/net.js named for TCGplayer, a page, and the filter POST
src/walk.js      a year: set it, read every page, put the visitor's range back
src/handoff.js   core/handoff.js's sender, Magic only, with TCGplayer's words
src/ui.js        core/ui.js's panel and download, the panel headed TCG
src/page.js      content script: order buttons, Send to BAN, the panel
src/orders.css   the order headers' controls; the panel's are core/panel.css
scripts/cut-fixtures.mjs  cuts tests/fixtures/ from a saved page, locally only
tests/mutations.json      each guard, what breaks it, the test that fails
tests/panel.js   stands the content script up in a window; clicks are real
tests/           bun + happy-dom, no browser
```

The scripts share one global, `globalThis.TCGB`, the way the browser runs
them; `tests/helpers.js` runs them the same way and stands in for TCGplayer's
session (a range, a search, and pages of a list cut from the fixture).

## Traps

**The date range is session state.** TCGplayer keeps the range, and a search,
in the session, not the URL. Every GET is filtered by whatever was last
POSTed, by this extension, by the visitor in another tab, or by the page's
own dropdown. That is why the walk checks every page names the year it asked
for, and why it puts the visitor's range and search back, verified, whatever
happens. A search is scoped by the range: an order outside the range is "No
orders match your search criteria."

**The order number is a bare text node** after the label's `<br>`. Replacing
it is what makes it a button; reading a whole span's text would take the
label with it.

## Things not to do

- **Do not drive TCGplayer's search by key events.** The box carries jQuery
  autocomplete; setting `.value` and submitting the page's own form with its
  own button is all a search needs.
- **Do not guess** a condition, a language or a game either. A line that
  cannot be read whole carries what was read and says why; it is not sent to
  BAN. A history with an order that cannot be read whole writes nothing.
- **A 429 stops the walk too**, as a challenge does.

## Working with the other repositories

The cards CSV's columns and how the upload reads them are SPECIFICATIONS.md
section 6. A header of exactly "TCGplayer Id" is a SKU that wipes the product
id.
