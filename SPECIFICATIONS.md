# BANner: specification

What the extension promises on every store, and what the stores share. What
is known about a store's pages, and what it does there, is in that store's
own `SPECIFICATIONS.md`. `AGENTS.md` says how to work on it.

## 1. What it is

A Manifest V3 browser extension that reads a card store's own pages, in the
visitor's own session, and saves what they list as CSV or hands it to mtgban's
upload. There is no build step: the repository's root is the extension.

| Store | Host | Prefix | Global | Specification |
|---|---|---|---|---|
| Cardmarket | `www.cardmarket.com` | CM | `MKM` | [`sites/cardmarket`](sites/cardmarket/SPECIFICATIONS.md) |
| Card Kingdom | `www.cardkingdom.com` | CK | `CKB` | [`sites/cardkingdom`](sites/cardkingdom/SPECIFICATIONS.md) |
| TCGplayer | `store.tcgplayer.com` | TCG | `TCGB` | [`sites/tcgplayer`](sites/tcgplayer/SPECIFICATIONS.md) |
| ManaPool | `manapool.com` | MP | `MPB` | [`sites/manapool`](sites/manapool/SPECIFICATIONS.md) |
| Star City Games | `starcitygames.com` | SCG | `SCGB` | [`sites/starcitygames`](sites/starcitygames/SPECIFICATIONS.md) |

| | Order history | One order | Carts and lists |
|---|---|---|---|
| Cardmarket | purchases, one list per status | CSV, Send to BAN | a seller's offers: CSV, Send to BAN |
| Card Kingdom | purchases and sales | an invoice: CSV, BAN | sell and buy carts: prices compared, *Update price* on the sell cart, CSV, BAN |
| TCGplayer | orders | CSV, Send to BAN | |
| ManaPool | orders | an order or a package: CSV, Send to BAN | the cart: *Remove seller*, *Only this seller*, *Put back* |
| Star City Games | orders | CSV, Send to BAN | |

## 2. What it asks for

Nothing: no `permissions`, no host or optional permissions, no background
script, no web-accessible files, and no call to an extension API. Each
content script entry names one store's host and loads that store's files and
`core/`'s alone. Root tests hold all of it.

Requests go to the store's own origin, with the session the page has, but for
two public files read without it: Card Kingdom's price list and the exchange
rates Cardmarket's prices are converted by. Nothing is posted to mtgban from
here (section 7). Three things change something at a store, each on a click:
*Update price* on Card Kingdom's sell cart, the order range TCGplayer keeps
in its session, put back after a walk, and ManaPool's cart. What is kept between pages is kept in the store's own
origin: Card Kingdom's price list and CSVs in IndexedDB, and ManaPool's
set-aside cart items in localStorage.

## 3. How it is put together

The scripts are plain, not modules, since that is what a content script can
be; each page's entry lists them in the order they load. `core/` is factories
on `globalThis.BAN`, with no state and no store's name in it. A store binds
what it uses onto its own global (section 1) and loads only the core files it
needs. No store's source names another store's host.

## 4. The panel

One panel, `core/ui.js` and `core/panel.css`, fixed to the bottom right: a
heading, one row of controls, and a tooltip the panel draws itself.

- **The heading** is the stroopwafel, the store's prefix and "BANner", then at
  most one word or count and one mark: a green tick for work done, a red cross
  for work refused. On some pages it is a control.
- **The tooltip** is the one place for what finished or failed work has to
  say; with nothing to report it says what the panel offers, and while work
  runs it is empty. Nothing is written under the row, and nothing in the panel
  has a `title`.
- **The size never changes.** The panel is 240px wide and nothing it says adds
  a line, since it sits under the cursor.
- **While work runs** a spinner turns in the heading, every control in the row
  is disabled, and the page asks before it is left. Escape stops a read, and a
  stopped read writes nothing.
- **It styles itself completely**, since the store's own styles reach it.

## 5. Histories, ranges and files

Every history offers a range: the last 30, 90 or 120 days, every year, or one
year back to the store's first; TCGplayer's are the ranges its page lists.
The last days are the orders dated on or after that many days before the
browser's today. The picker is `core/ranges.js`'s, 92px wide in every store.

A history is one line per order, and its file is `<stem>-<year>.csv`,
`<stem>-all.csv`, or `<stem>-last-30-days-<yyyy-mm-dd>.csv`, dated since the
same range holds other orders tomorrow. The stems are
`cm-purchases-<status>`, `ck-purchases` and `ck-sales`, `tcg-orders`,
`mp-orders` and `scg-orders`.

A walk that misses a page, or sees the list change so that it cannot vouch
for it, writes nothing. Whether one order that cannot be read is left out and
counted or stops the walk is each store's own.

## 6. Reading

- **Requests** are one at a time, 1.2 s apart (`PACE`, each store's own), 30 s
  each at most. A Cloudflare challenge, told by its `cf-mitigated: challenge`
  header, stops the work and is never answered or retried. On TCGplayer a 429
  without one is said as the store asking to slow down.
- **Money** printed in dollars is read by its shape, to cents, never by
  `parseFloat`; a shape not known is refused. Cardmarket reads euros and
  pounds its own way.
- **Nothing is guessed.** A price, an id or a card that does not read is an
  empty column or a row left out, and the panel says how many.
- **A CSV** is byte for byte what Go's `csv.Writer` writes for the same rows.
  Every row ends in LF, but Cardmarket's end in CRLF. The columns of a file
  that can be sent are named for how mtgban-website's `internal/docparse`
  reads a header.

## 7. Send to BAN

The upload needs mtgban's session, and its cookie is not sent on a request
made from another site. So the rows go to a page of mtgban's own,
`/upload/handoff`, opened by the visitor's click, and that page uploads them.
It takes a list only from the sites in mtgban-website's `handoff_origins`,
which lists all five.

Each game has its own deployment (`core/handoff.js`, `HOSTS`); Magic's is
`mtgban.com`. Cardmarket sends every game it and BAN share; the other four
send Magic alone.

**By message**, every store but ManaPool. The click opens the tab, with
nothing asynchronous in front of it. The page says it is listening, and the
rows go to it:

```
click       window.open("https://<host>/upload/handoff")
handoff  -> { type: "mtgban-handoff-ready" }
extension-> { type: "mtgban-handoff-rows", csv, rows, source: location.href }
```

Only the tab this page opened is heard, and only from `mtgban.com` or a
subdomain over https; the answer goes to the origin that spoke. One handoff
waits at a time: a second closes the first one's tab. A tab closed before it
took the rows is noticed on coming back to the page, with no timer.

**In a link**, ManaPool, whose pages carry `Cross-Origin-Opener-Policy:
same-origin` and so cannot hear a tab they open on another site. The cards are
read first, then a link is clicked:

```
https://mtgban.com/upload/handoff#mtgban-handoff-rows=<{csv, rows, source}>
```

The list is JSON, percent-encoded, in the fragment, which no server is sent.
mtgban's page removes it from the address at once and takes it when the
referrer's origin is an allowed one, so the link sends its origin
(`referrerpolicy="origin"`). Where reading outlasts what the browser lets one
click open, the panel asks for a second press.

A referrer says which site a link was on and not who wrote it: anyone who can
place a link on an allowed site can have whoever follows it price a list. The
message route cannot be used that way. mtgban-website documents both.

## 8. Tests

`bun run test` runs every site's suite and the repository's own, against
happy-dom, with no browser. `bun run mutate` breaks each guard listed in a
site's `tests/mutations.json` and checks the test it names fails. Fixtures are
cut from saved pages, or made up in a store's own shape, and hold nothing of
an account; each site's tests scan them. What each store has and has not been
checked on live is in its own specification.

## 9. Not verified

- **Safari.** The extension is written to run there and has never been built
  for it.
- **The link handoff on the live sites.** It was run in Firefox with the
  extension's scripts and mtgban's, on stand-in pages with ManaPool's header,
  and not in Chrome or in a signed-in account.
