# BANner for ManaPool

**MP BANner** is BANner's panel on ManaPool.

- **On your order history** (`manapool.com/settings/orders`) you pick a
  year, every year, or the last 30, 90 or 120 days, and download a CSV of
  those orders, one line each: order number, date, sellers, packages,
  items, subtotal, shipping, tax and total. An order split between several
  sellers is one line, its sellers named in it.
- **On an order** (`manapool.com/settings/orders/<id>`) it sends the
  order's cards to BAN, every seller's, each with its Scryfall id, or saves
  them as CSV. Refunded cards, replacements that came as their own order,
  and sealed products are left out, and the panel says how many.
- **On a package** (`manapool.com/settings/orders/suborder/<id>`) it does
  the same for that seller's cards alone.
- **In your cart** each seller gets two buttons under its name. *Remove
  seller* takes all of that seller's cards out. *Only this seller* sets
  every other seller's cards aside, so you can check out from that one
  seller alone; afterwards *Put back*, on the panel, returns them from the
  same sellers, and names any that sold out meanwhile.

It reads your orders from ManaPool's own buyer API, with the session your
browser already has, so it needs no token and no permission.
