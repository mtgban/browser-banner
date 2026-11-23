# BANner for ManaPool: specification

What the extension does on ManaPool, what it reads, and the rules it keeps.
Every fact about ManaPool here was read off a signed-in buyer's account on
2026-11-23.

## 1. What it is

A content script on `https://manapool.com/*`, with the panel every store
shares (the "MP BANner" heading, a mark, a drawn tooltip, one row of
controls). On the order history, `/settings/orders`, it saves the orders
as CSV, one line per order.

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
`location.pathname` twice a second: the order history gets its panel, any
other path none, and leaving takes the panel away and stops any read it
started. A redraw of ManaPool's page that takes the panel puts it back.

## 5. Not yet

- An order's cards, `/settings/orders/<id>`: CSV and Send to BAN, each
  card with its Scryfall id from the API's order detail.
- The cart.
- Send to BAN needs `https://manapool.com` in mtgban-website's
  `handoff_origins`.
