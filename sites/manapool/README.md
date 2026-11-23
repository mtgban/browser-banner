# BANner for ManaPool

**MP BANner** is BANner's panel on ManaPool.

- **On your order history** (`manapool.com/settings/orders`) you pick a
  year, every year, or the last 30, 90 or 120 days, and download a CSV of
  those orders, one line each: order number, date, sellers, packages,
  items, subtotal, shipping, tax and total. An order split between several
  sellers is one line, its sellers named in it.
- **In your cart** each seller gets two buttons under its name. *Remove
  seller* takes all of that seller's cards out. *Only this seller* sets
  every other seller's cards aside, so you can check out from that one
  seller alone; afterwards *Put back*, on the panel, returns them from the
  same sellers, and names any that sold out meanwhile.

It reads your orders from ManaPool's own buyer API, with the session your
browser already has, so it needs no token and no permission.
