# BANner for ManaPool: specification

What the extension does on ManaPool, what it reads, and the rules it keeps.
Every fact about ManaPool here was read off a signed-in buyer's account on
2026-11-23.

## 1. What it is

A content script on `https://manapool.com/*`, with the panel every store
shares (the "MP BANner" heading, a mark, a drawn tooltip, one row of
controls). On the order history, `/settings/orders`, it saves the orders
as CSV, one line per order. In the cart, `/cart`, each seller gets Remove
seller and Only this seller, and the panel puts back what Only this seller
set aside (section 5).

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
dollars, as the API gives them. Newest first. An order missing any of
those, or with a suborder missing its seller's name or its item count, is
left out and counted.

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
`location.pathname` twice a second: the order history and the cart get
their panels, any other path none, and leaving takes the panel away and
stops what it started. A redraw of ManaPool's page that takes the panel,
or the cart's seller buttons, puts them back.

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

- **Remove seller** takes each of that seller's items out in turn, through
  its own quantity list as a person would by keyboard: focus, ArrowDown
  (the list opens with "remove" highlighted), Enter. The next waits until
  the stored cart has lost exactly one listing.
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

## 6. Not yet

- An order's cards, `/settings/orders/<id>`: CSV and Send to BAN, each
  card with its Scryfall id from the API's order detail.
- Send to BAN needs `https://manapool.com` in mtgban-website's
  `handoff_origins`.
