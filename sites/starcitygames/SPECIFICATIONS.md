# BANner for Star City Games: specification

What the extension does on Star City Games, what it reads, and the rules it
keeps. Every fact about the pages here was read on 2026-11-23, off a signed-in
account's whole list of 123 orders, 2019 to 2026, each fetched as section 3
says, and off saved pages and the store's own public scripts.

## 1. What it is

A content script on `https://starcitygames.com/account.php*`, with the panel
every store shares (the "SCG BANner" heading, a mark, a drawn tooltip, one
row of controls). On the order list, `?action=order_status`, it saves the
orders as CSV, one line per order (section 3). On an order,
`?action=view_order&order_id=<id>`, it sends the order's cards to BAN or
saves them as CSV (section 4). It is the buying side alone; the buylist is
another site.

## 2. The pages

Star City Games runs on BigCommerce.

- **The order list** is `.orders-list`, one `.account-listItem` an order,
  newest first, ten to a page: the number in the title's link, "Order
  Placed" as "Nov 21st 2026". Its total is the order's grand total, what was
  left to pay after store credit, $0.00 for most orders. It says nothing of
  refunds. The next page is `.pagination-c-item--next`'s link, absent on the
  last. The pager's "Page 1 of 6" is not a count: that list had 13 pages.
- **An order's page** boots the store's script with
  `stencilBootstrap("account_order", "<JSON in a string>")`, and that JSON's
  `order` is everything the page draws: `status`, `status_text`,
  `total_rows` (a label and a value each), and `items`, each with
  `quantity`, `refunded_qty`, `refunded`, `price`, `sku`, `name` ("Daze
  [SGL-MTG-NEM-30-ENF]"), its `Condition` option, and `image.alt`, whose
  second line is the set ("Nemesis"); its lines are parted by a line break
  or by a backslash and an n. The rest of the JSON is the account's, and is
  not read.
- An item's `price` is its price before the order's coupon or discount. The
  price after it, drawn beside the first as `.paid-price`, is not in the
  page: the store's script asks `ajax.starcitygames.com` for it, with the
  customer's token. That is another host and is never asked; what the script
  has drawn is read where the page is open.
- Shipping a buyer's cards back is an item of its own, SKU `BUYER-RETURN`,
  at no price. It is no card, and is counted nowhere.

`refunded` says the whole quantity was refunded; `refunded_qty` is how many.
Neither the totals nor the list change when an item is refunded. BigCommerce
numbers the status Refunded 4, Cancelled 5, Declined 6; of those only
Cancelled was seen, with every copy refunded.

## 3. The order history

One line per order: Order Number, Order Date, Status, Items (copies kept),
Refunded (copies refunded), Subtotal, Discount, Shipping, Tax, Total. Newest
first, as the list is. The range is the other stores': the last 30, 90 or
120 days, every year, or one year back to 1995, when Star City Games opened.
The list is read from its first page until it ends or an order is older than
the range; then each order in range is opened, `PACE` between one request
and the next. The file is `scg-orders-<range>.csv`. A refused page, or one
with no list or no order on it, saves nothing and says why. Escape stops the
read. An order whose line does not read is left out and counted. When the
list read no order at all, or every order in range has a page that does not
read, the panel fails and says how many, rather than that there are none.

What an order came to is added up from its lines, never read off its total:

- `total_rows` may hold Subtotal, Coupon Code (a code), Discount, Shipping,
  Tax, Store Credit and Grand total, and the 123 orders hold nothing else.
  Any other label leaves the order's amounts empty, and the panel names the
  order and why.
- With nothing refunded, the amounts are the order's own, and Total is what
  was paid: Grand total and Store Credit. On 3 of the 123 they are off each
  other, two of them by a cent or three; what was paid is what it came to.
- A refunded copy is in no amount. Subtotal is the copies kept at their
  prices, Discount what came off them, and Total is Subtotal less Discount
  plus Shipping.
- A discount is a whole percent, 5 or 10, of each line rounded to a cent on
  its own: that gives 81 of 92 discounts to the cent. Of the others, one was
  opened, and leaves out a card already on sale. So a refund's share of a discount is known only
  where one whole percent gives the discount; its share of a tax is not. A
  refund in any other case, or on an order whose lines do not add up, leaves
  the amounts empty, as above.
- An order with every copy refunded, or whose status is Refunded, Cancelled
  or Declined, is zeros, its shipping included.

Over the 123, every page read. The 94 newest, run through the rule as it
stands, all have their amounts, 18 of them with a refund. Of the 29 oldest,
run before discounts were rounded line by line, one refund under a discount
had none then; the account was signed out before it could be run again.

Signed out, an account page answers with the home page, which is refused:
after some 230 pages in two reads, Star City Games signed the session out.

On the saved order with a 5% coupon and three copies refunded, $544.09 was
paid, the page prints those copies at $213.72 after the coupon, and the line
says $330.37, the difference. On the one with no discount, $3,351.80 was
paid, $2,349.98 of it refunded, and the line says $1,001.82.

A refund of something other than an item, shipping among it, shows nowhere
on these pages and is not known of.

## 4. An order's cards

Read from the page itself on the click; nothing is asked. One line per
card kept, in the page's order: Name, Set, Number, Finish, Condition,
Language, Quantity, Price, SKU, headed so mtgban's upload reads them. Price
is what was paid for each copy, as the store's script has printed it beside
the card. Where it has not, the discount is taken off to the cent, which
gives what it prints beside all five cards of the saved order with a coupon;
it is empty where the discount is not one whole percent or the totals do not
read, and the panel counts those lines.

The SKU is `SGL-<game>-<set>-<number>-<language><finish><grade>`. Finish is
N for a nonfoil, F for a foil, and A for a foil too. Condition comes from
the item's own: Near Mint is NM, Played SP and Heavily Played HP, as
go-mtgban reads them. Set is the picture's, or the SKU's code where it
carries none. A promo's SKU, set `PRM`, is filed under "Promo", and its
number names a kind: of `PRE_SNC_230` (Prerelease), `PP_DMU_244` (Promo
Pack), `SECRET_SLD_1468`, `JDG_G02_002` and `BUN_MAT_229` the second part is
the set mtgban has it in.

Measured against go-mtgban's own reading of Star City Games' catalog, with
the name, set and number a SKU gives, mtgban's matcher found 145,006 of
153,049 English Magic singles exactly, 2,011 as another printing, and the
rest not at all or as one of several; 3,361 of those not found are tokens.
Every card on the saved orders is found exactly.

Left out and counted: refunded copies of anything, another game's cards,
products that are not singles (a SKU not starting `SGL-`), and lines that do
not read. Send to BAN opens mtgban's `/upload/handoff` and hands it the CSV;
mtgban takes it because `https://starcitygames.com` is one of its
`handoff_origins`.

## 5. The panel

A range picker and Download CSV on the list; Send to BAN and CSV on an
order. The heading counts pages, then orders, as they are read. What a
finished read has to say is on the tooltip. While Send to BAN waits for its
tab, CSV still saves, and Send to BAN again closes that tab and opens another.

## Not yet

- **The cart.** No saved page of it yet.
- **Other games.** No saved order with one yet.
- **Other totals.** A gift certificate, a handling charge or a wrapping is
  not a known label until a saved order shows how it reads.
