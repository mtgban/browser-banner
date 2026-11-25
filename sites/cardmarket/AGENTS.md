# AGENTS.md

Guidance for AI coding agents working on Cardmarket's part of **BANner**, the
browser extension: it reads a Cardmarket seller's offers, or one of the
visitor's purchases, and gets them to mtgban's upload, and saves the purchase
lists as CSV. Read `SPECIFICATIONS.md` for what it does and what is known
about Cardmarket's markup; this file is about how to work on it without
breaking it.

The root's `AGENTS.md` holds here too: how to run the tests, the rules, the
traps and the commits. This file says only what is this store's own.

## The one rule that matters

**Verify against a saved Cardmarket page, not against the fixture.**

The fixture in `tests/fixtures/offers.html` is a reconstruction. Every time
it has disagreed with a real page, the real page was right and the
reconstruction had been written to match whatever the code already did:

- Sealed offers parsed **0 of 20** on the first real page. The fixture had
  invented a three-segment sealed URL; Cardmarket files sealed under two.
  Fixture and parser agreed, and both were wrong.
- A common priced at **$11.53** instead of $0.06, because the price was read
  off the row's flattened text and a neighbouring quantity had glued itself
  to the front of the number. The fixture had no digit next to a price.
- Names were read from the URL slug until a real page showed **6 of 20**
  rows losing accents, commas, colons or a whole ligature to it.

None of these were subtle once a real page was in hand, and none were
visible without one. When you change the parser, ask for a saved page
(`Cmd-S`, complete) and run against it.

**Saved pages are not committable as they are.** They carry the visitor's
session: a `__cmtkn` cart token on every row, and a `csrftoken` and `idUser`
in the filter component's `data-props`. To make a fixture from one, keep only
the rows and the component, drop every `__cmtkn` input, keep only the
`options` of the props, and call the seller `Seller`, as
`tests/fixtures/offers-props.html` does.

## Layout

```
src/rates.js     the currency feed, and the inversion it needs
src/parse.js     DOM → offers. The volatile half; see SPECIFICATIONS.md §3
src/pages.js     one page → every page, at Cloudflare's pace; see §6
src/csv.js       offers → CSV, quoted by core/csv.js; the mtgban contract, §4
src/ui.js        core/ui.js's panel and download, the panel headed CM
src/handoff.js   core/handoff.js's sender, every game BAN prices, "use the CSV"
src/content.js   what the panel does, and when it sends
src/orderpage.js one purchase's panel: CSV and Send to BAN, no walk; §8
src/history.js   a purchase list's orders, one line each; §9
src/historypage.js  the purchase lists' range and Download CSV; §9
src/content.css  what this panel adds to core/panel.css
tests/panel.js   stands the content script up in a window; clicks are real
tests/mutations.json  each guard, the text that breaks it, the test that fails
tests/           bun + happy-dom, no browser
```

## Verifying

To look at the panel, load the extension unpacked and open a real offers
page. There is deliberately no demo page: the last one had to be taught a
fake offers path to get past the manifest and the row count, which is a
demo arranging to look like the thing rather than being it.

### Traps that cost real time here

**The browser caches `src/*.js` across reloads.** A fix can look like it did
not work when it is simply not loaded. A query string on the HTML does not
help - the `<script src>` is what is cached. Serve from a **fresh port** to
get a clean origin. This produced two rounds of "the fix didn't work" on a
fix that was already correct.

**A source-reading test says the code still reads right, not that it runs.**
A rewrite that sliced `content.js` between two comment markers swallowed
`var generation = 0;` along with the lines it meant to replace. `node --check`
passed, because a missing declaration is a runtime `ReferenceError` and not a
syntax error. The whole suite passed too, because the function body still
*mentioned* `generation`. The panel's main button silently did nothing, and it
took a user to notice.

`tests/panel.js` exists because of that: it evaluates the content scripts in a
happy-dom window, so a click is a click and the button's own text is the
assertion. Put anything the panel *does* there. Keep `content.test.js` for
orderings that have no visible result - opening a window before a read rather
than after it looks identical afterwards, and only a browser can tell you which
one it was.

**Icons are cached hard.** Removing and re-adding the extension is the
reliable way to see a new one.

**Cardmarket is behind Cloudflare, and it is the thing that decides whether
this works.** A `curl` gets a flat 403; three `fetch`es inside a second get a
challenge and then a "Verify you are human" checkbox on the next ordinary
page load. Treat that budget as the real constraint on anything that adds a
request, and never try to answer the challenge in code - it is meant for the
person at the keyboard, it is theirs to clear, and code that got around it
would be the worst thing in this repository. `PACE` in `src/pages.js` is a
guess at politeness, not a measured limit; if you change it, say in the commit
what you actually observed.

That budget includes a saved page loaded into happy-dom, which fetches the
page's own files; that happened once and left the process hanging on the
requests.

## Things not to do

**Do not drive mtgban's upload form.** An earlier version synthesised a
`File` into `input[name="cardListFile"]`, dispatched `change` so the page's
inline handler would fire, and clicked `#submit_default` because that is
where the submitting logic lives and it starts `disabled`. It worked, and
every line of it was a copy of mtgban's markup living in a repository that
does not own it. `/upload/handoff` exists so this does not have to happen
again; see SPECIFICATIONS.md §5.

**Do not go back to `storage`.** It was added once to carry a CSV between two
tabs and removed again when `postMessage` turned out to do it: the two windows
can already speak, because one opened the other. The panel's stroopwafel is
base64 in the stylesheet for the same reason, since a relative `url()` would
need a file declared web-accessible.

**Do not guess.** Every place it comes up here, the refusal is the answer: an
unknown currency, an id the site does not carry, a row with no thumbnail.
`SPECIFICATIONS.md` says why in each case.

## Working with the other repositories

The CSV's columns and how the upload reads them are SPECIFICATIONS.md §4.

The condition fold is **go-mtgban**'s, in `cardmarket/market.go`. Do not
invent one; read it.
