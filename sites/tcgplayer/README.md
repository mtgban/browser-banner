# BANner for TCGplayer

**TCG BANner** is a browser extension for your TCGplayer order history
(`store.tcgplayer.com/myaccount/orderhistory`). It does three things:

- **Saves a year, every year, or the last 30, 90 or 120 days, as CSV.** Pick
  one and click *Download CSV* for one row per order: `Order ID`, `Order
  Date`, `Amount` net of refunds, then seller, the state the sales tax names,
  quantity, subtotal, shipping, tax, the refund as a negative amount and how
  much of it was tax (exact for a full refund, estimated from the order's tax
  rate for a partial one), the total net of the refund, and the tax net of it.
  You do not have to set the page's date range first: the extension selects
  the range itself, reads every page, checks each one is still that range, and
  puts your range and search back when it is done. *All years* reads each year
  in turn, and says how many requests that takes before it starts.
- **Makes every order number a link.** Clicking `17B3D927-60B89F-0DA62` runs
  TCGplayer's own search for it and shows you that order alone. There the
  panel is that order's: *Download CSV* saves its cards, one row per line,
  and *Send to BAN* sends them.
- **Sends an order to BAN.** The BAN icon beside an order number opens mtgban's
  uploader in a new tab and hands it the order's cards, each by its TCGplayer
  product id, so every card resolves to its exact printing.

Magic only, for now: a line of another game, or one whose condition the
extension cannot read whole, is left out of a send and counted.

## Permissions

None. Everything the extension reads or sends goes to the TCGplayer page it
runs on, as you, one request at a time with a pause before each. *Send to BAN*
opens mtgban's `/upload/handoff` in a tab of its own and passes it the cards
with `postMessage`; that page uploads them with your mtgban session. Nothing
else leaves your browser.

Saving a year changes one thing you can see: while it reads, TCGplayer's own
date range is that year. If the tab is closed mid-read, the page's dropdown
will show the year until you change it back.

## Installing it

BANner is one extension for every store it reads; install it from the
repository's root, as its README says. Then open your order history on
TCGplayer; the panel is at the bottom right.

## Developing

From the repository's root:

```
bun install
bun run test
bun run mutate sites/tcgplayer
```

`bun test tests/` here runs this site's suite alone, without the repository's
own tests. `AGENTS.md` says how to work on it, and `SPECIFICATIONS.md` what it
reads from TCGplayer and why.
