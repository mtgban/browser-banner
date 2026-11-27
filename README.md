# browser-banner

**BANner** is a browser extension that reads a card store's own pages and
gets what they list to [mtgban](https://www.mtgban.com), as a CSV or by
handing it to mtgban's upload page. It asks for no permissions and runs only
on the stores' pages, each with its own panel.

| Store | Directory | What it reads |
|---|---|---|
| Cardmarket | [`sites/cardmarket`](sites/cardmarket) | a seller's offers, one purchase, and the purchase lists |
| Card Kingdom | [`sites/cardkingdom`](sites/cardkingdom) | the sell and buy carts, order and selling history, and both invoices |
| TCGplayer | [`sites/tcgplayer`](sites/tcgplayer) | the order history, an order to send, and the cart |
| ManaPool | [`sites/manapool`](sites/manapool) | the order history, an order or a package to send, and the cart by seller |
| Star City Games | [`sites/starcitygames`](sites/starcitygames) | the order history, and an order to send |

Each store's own README says what it does there; its SPECIFICATIONS.md
says what is known about the store's markup.
[SPECIFICATIONS.md](SPECIFICATIONS.md) says what every store shares.

[docs/single-extension-plan.md](docs/single-extension-plan.md) is the plan
that made the first three stores' extensions one, with its reasons.

## Installing it

One unpacked folder, this repository's root, works in Chrome, Firefox and
Safari.

**Chrome** - `chrome://extensions`, turn on Developer mode, *Load unpacked*,
and pick this folder.

**Firefox** - `about:debugging#/runtime/this-firefox`, *Load Temporary
Add-on*, and pick `manifest.json`. Firefox runs a Manifest V3 extension on a
site only once you allow it there, so a store's panel does not appear until
you do: on the store's page, click the Extensions button (the puzzle piece),
then BANner, and choose to always allow it there; or in `about:addons`,
BANner, *Permissions*, turn on the store. Firefox drops a temporary add-on
when it restarts, so this needs redoing each session.

**Safari** - Safari runs the same extension but wants an app around it,
which needs Xcode:

```
xcrun safari-web-extension-converter .
```

Run the generated project once, then enable the extension in Safari's
settings. For an unsigned build, Safari's Develop menu has to have *Allow
Unsigned Extensions* turned on, which Safari resets when it quits.

## Testing

```
bun install
bun run test
bun run mutate
```

The last breaks each guard a site lists in `tests/mutations.json` and
checks a test notices.
