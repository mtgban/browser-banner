# BANner for ManaPool: specification

What the extension does on ManaPool, what it reads, and the rules it keeps.
Every fact about ManaPool here was read off a signed-in buyer's account on
2026-11-23.

## 1. What it is

A content script on `https://manapool.com/*`, with the panel every store
shares (the "MP BANner" heading, a mark, a drawn tooltip, one row of
controls). On the order history, `/settings/orders`, it saves the orders as
CSV, one line per order. On an order, `/settings/orders/<id>`, it sends the
order's cards to BAN or saves them as CSV, and on one of its packages,
`/settings/orders/suborder/<id>`, that seller's alone (section 6). In the
cart, `/cart`, each seller gets Remove seller and Only this seller, and the
panel puts back what Only this seller set aside (section 5).

## 2. The buyer API

ManaPool serves a buyer API, the one go-mtgban's `cmd/manapoolOrders`
reads with an access token. From a ManaPool page it answers the session the
page already has: a same-origin request, so no permission and no token.

- `GET /api/v1/buyer/orders?limit=&offset=&since=` lists orders oldest
  first, at most 100 at once, `since` an ISO time. Each order has `id`,
  `order_number`, `created_at` (UTC), `subtotal_cents`, `shipping_cents`,
  `tax_cents`, `total_cents`, and `order_seller_details`: one entry per
  seller's suborder, with `seller_username`, its own `order_number`
  ("800917-2803072"), `shipping_cents` and `item_count`.
- Signed out, it answers 401.

An order's total is its subtotal, shipping and tax and nothing else. The
order page's total adds ManaPool's service fee on singles, which the API
does not give: an order of $69.39 by the API is $71.42 on the page. A
"Gathered" order, consolidated at ManaPool's hub, charges less shipping
than its sellers' own shipping adds up to.

## 3. The order history

One line per order, its suborders folded in: Order Number, Order Date (the
browser's own time, as ManaPool's page shows it, "2026-11-21 03:00"),
Sellers (each seller's name, joined by "; "), Packages (the suborders),
Items (their item counts added up), and Subtotal, Shipping, Tax and Total in
dollars, as the API gives them. Newest first. An order missing any of those,
or with a suborder missing its seller's name or its item count, is left out
and counted. When no order could be read at all, the panel fails and says
how many, rather than that there are none.

The range is the other stores': the last 30, 90 or 120 days, every year, or
one year back to 2024, when ManaPool's first orders were placed. The API
is asked from the range's first day, in the browser's time, and the lines
are kept to the range again on arrival. It pages 100 at a time, waiting
`PACE` before each request after the first, until an answer comes back
short. The file is `mp-orders-<range>.csv`. A refused answer saves nothing
and says why; a 401 says to sign in. Escape stops the read.

Run in a signed-in account's own ManaPool page, 25 orders to a request, the
reader took 61 orders in three requests 1.4 seconds apart, all whole, every
order number once and every total its subtotal, shipping and tax; 14 were
split between sellers. The order history lists the same 61, 50 and 11.

## 4. Following the address

ManaPool moves between its pages without loading them, and a content script
runs only on a load. So the script runs on every ManaPool page and looks at
`location.pathname` twice a second: the order history, an order, a package and
the cart get their panels, any other path none, and leaving takes the panel
away and stops what it started. A redraw of ManaPool's page that takes the
panel, or the cart's seller buttons, puts them back.

## 5. The cart

ManaPool keeps the cart in the page's localStorage, `manapool-cart`:
`{ version, revision, cart: { entries }, changes }`, each entry a seller's
listing, `{ inventoryId, quantitySelected, source?, optimizerTouched }`,
and each change `[inventoryId, delta, source, optimizerTouched]`. The page
sends the changes to its server (`synchronize_cart_items`) only while it
has focus, and takes the server's cart back. It listens for `storage`
events on the key and checks nothing but the key and the new value.

The cart page lists each seller's items as a `ul` of `li` under one
seller's links, the seller named in an `h3`. An item shows its name, set,
finish and condition, and a quantity list (`aria-label="Update Quantity"`)
whose first option is "remove", value 0. No listing's id is on the page.

The buttons are drawn at the right of the row across a seller's section,
its name at the left: Remove seller red, Only this seller the panel's blue.
Where they do not fit beside the name they wrap under it.

- **Remove seller** takes each of that seller's items out in turn, through
  its own quantity list as a person would by keyboard: focus, ArrowDown
  (the list opens with "remove" highlighted), Enter. The next goes as soon
  as the stored cart has lost exactly one listing, a few milliseconds on.
  The item and its list stay on the page some 0.3 s more, so each item's
  list is found by its own button's `aria-controls`, and the run ends once
  the items are off the page. Taken out this quickly, ManaPool asks for one
  new checkout preview for the lot; a second apart, for one each.
- **Only this seller** takes every other seller's items out the same way,
  and keeps each listing the stored cart lost, with its quantity, seller,
  name, set and tags, in localStorage beside it, `banner-manapool-stash`.
  Only that seller is left to check out.
- **Put back** writes the kept listings into the stored cart as changes,
  as ManaPool's own add queues them, and announces the write as another
  tab's would be; the page syncs them from their own sellers. A listing the
  cart already holds is left out. It then waits until the stored cart no
  longer carries those changes, ManaPool's sync having run; a listing the
  sync dropped is named, with its seller, as no longer listed. With no sync
  in 15 seconds (the page out of focus), the set-aside list is kept and
  Put back says so.

Remove seller reads the seller's items when clicked, since ManaPool may
have redrawn them since the buttons were drawn.

An item ManaPool does not take out, or a list with no "remove", stops the
run and says which. Escape stops it between items. The extension's own key
presses do not count as the person's Escape.

Run in a signed-in account's cart of 7 listings from 6 sellers: an item
taken out through its list was its listing gone from the stored cart, and
put back it returned under the same seller at the same price, the cart
whole again after the page synced.

Run in a signed-out cart of 26 listings from 3 sellers: one seller's 24 were
out of the stored cart in 0.29 s and off the page in 0.39 s, the other 2
untouched, with one checkout preview asked for. Not timed signed in.

Signed in, ManaPool's own script (read 2026-11-24) syncs at most every 3
seconds, one sync at a time under a lock: it sends the changes queued so
far, and takes the answer as the server's cart with the changes queued since
added again. So a sync answered during a run, or after it, does not bring
back an item taken out meanwhile; one that fails puts its changes back in
the queue and leaves the stored cart as it is.

## 6. An order's cards

`GET /api/v1/buyer/orders/<id>` answers with the order, every seller's
suborder in `order_seller_details`: its `fulfillments` (the last one's
`status`, "shipped" or "refunded"), its `items` and its `refunded_items`.
An item has an `order_item_id`, `quantity`, `price_cents` each, a
`product` (`mtg_single` with a `single`: `scryfall_id`, `name`, `set`,
`number`, `finish_id` NF, FO or EF, `condition_id` NM, LP, MP, HP or DMG,
`language_id`), and maybe a `replacement`: `quantity`, `same_package`,
and a `product` that is null when it does not name the card.

One line per card received, seller by seller: Scryfall ID, Name, Set,
Number, Finish (Nonfoil, Foil, Etched Foil), Condition, Language, Quantity
and Price each in dollars, headed so mtgban's upload reads every column it
can; nothing else is headed with "number", which it reads as the collector
number. Left out, and counted on the panel:

- **Refunded cards.** A refunded line names the item it refunds by
  `order_item_id`, and its quantity comes off that item; it is not a line
  of its own. A seller whose last fulfillment says "refunded" sent nothing,
  whatever its items say.
- **Replacements shipped on their own** (`same_package` false): they come
  as an order of their own, with their own page.
- **Replacements in the same package that do not name their card.** One
  that names its card is that card, for the quantity it replaced. ManaPool
  writes a card refunded at its hub with no replacement the same way: on a
  real Gathered order refunded whole, every item has such a replacement, its
  fulfillment says "shipped" and nothing is in `refunded_items`; the refund
  is only in the order page's own data. So the panel says these cards were
  replaced or refunded, ManaPool not saying which.
- **Sealed products**, which carry no Scryfall id, and any line that does
  not read whole.

ManaPool's own count of an order's items agrees with this on 8 of 10 real
orders, among them refunds, a seller refunded whole, and replacements of
each kind. On the other two, Gathered orders, it counts 5 unnamed
replacements as received; it does not on two other orders, so no rule
covers both, and those cards are left out and said.

The panel offers Send to BAN and CSV, and asks the API on the first click,
once. CSV saves `mp-order-<number>.csv`.

A package's page, `/settings/orders/suborder/<id>`, gets the same panel for
that seller's cards alone. The page links the order it is part of under its
heading, and that order's detail is what is asked for; the package is the one
suborder in it whose `id` is the page's, or whose `order_number` is the
heading's ("Package #797863-2793044"). A page that links no order, or an
order that does not list the package once, is said and nothing is saved. CSV
saves `mp-package-<number>.csv`.

ManaPool sends `Cross-Origin-Opener-Policy: same-origin`, so a tab its pages
open on another site has no opener and no message reaches either way: the
handoff the other stores use cannot work here. Send to BAN reads the cards,
then opens mtgban's upload with them in the link's fragment, as
`#mtgban-handoff-rows=` and the list as JSON, and mtgban's page takes them
where the referrer's origin is in its `handoff_origins`
(`https://manapool.com`). In Firefox a tab opened blank and sent there after
carries no referrer, so the link is clicked whole, once the read is done; a
browser lets a click open a tab for a few seconds, and where the read took
longer the panel says to press again. An address past 1,000,000 characters is
not sent, since Firefox opens none past 1 MiB.
