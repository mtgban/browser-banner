# AGENTS.md

Guidance for AI coding agents working on **browser-banner**. Each store's
extension lives under `sites/<store>/` with its own `AGENTS.md` and
`SPECIFICATIONS.md`: read the ones for the store you touch before changing
it, and follow them. What is here holds for every store, and a store's file
says only what is its own. `SPECIFICATIONS.md` at the root says what the
stores share and what the whole extension promises.

## Rules

- **Verify against a saved page of the store, not against a fixture.** A
  fixture is a reconstruction, and a reconstruction drifts toward whatever
  the code already does. When you change how a page is read, ask for a saved
  page (`Cmd-S`, complete) and run against it. Saved pages carry the
  visitor's session and are never committed as they are: work on them outside
  the repository and delete them after. Each site's AGENTS.md says what one
  carries and how to cut a fixture from it.
- **No permissions, no background script, no web-accessible files.** A site
  runs on its own store's host and nowhere else. If something seems to need a
  permission, check whether the web platform already offers it.
- **Never answer a Cloudflare challenge in code**, and never fan out
  requests: one page at a time, with a wait before each. A challenge is for
  the person at the keyboard: stop, and say so.
- **Do not write a short history.** A walk that missed a page, or saw the list
  move while it read, writes nothing.
- **`core/` holds what every store shares**, as factories on `globalThis.BAN`
  that each store binds onto its own global (`MKM`, `CKB`, `TCGB`, `MPB`,
  `SCGB`).
  Nothing in `core/` keeps state, names a store or touches a store's global;
  a root test holds it to that.
- **Do not guess at a price, an id or a card.** A row that cannot be
  resolved carries an empty column and the panel says how many.
- **Do not resize the panel, or write anything under its buttons.** It sits
  under the cursor. Status is a mark beside the heading and a drawn tooltip.
- **Do not write an em dash**, anywhere: not in what the panel shows, a doc,
  a comment or a commit. Use a plain dash, a comma or a new sentence;
  `tests/repo.test.js` checks.
- **Share through `core/`.** A store's side takes nothing from another's but
  its conventions.

## Layout

```
manifest.json    the one manifest: each store's pages, scripts and styles
core/net.js      one store's requests: the deadline, the challenge, one page
core/csv.js      rows to CSV, as Go's csv.Writer quotes them
core/money.js    the money a store prints, to cents and back; the calendar
core/ranges.js   the range picker, and the name its file is saved under
core/ui.js       the panel and the download
core/panel.css   how the panel looks, and the range picker in it
core/handoff.js  rows to mtgban's upload, by message or in a link
sites/<store>/   one store: its source, docs, tests and fixtures
scripts/mutate.mjs  breaks each guard and checks a test notices
tests/           the repository's own tests, and the manifest they share
```

A test holds this list to `core/`'s files, and each site's to its `src/`.

## Verifying

```
bun install
bun run test
bun run mutate
```

runs every site's suite and the repository's own tests, then breaks each
guard in every site's `tests/mutations.json` in turn, as CI does on every
push. `bun run mutate sites/<store>` runs one site's guards, and `bun test
tests/` in a site's directory its tests alone, without the repository's own.

There is no linter and no build step. The scripts are plain ES5-ish so they
can be `content_scripts` entries as they are; keep them that way.

A guard (a refusal, a strict shape, a check that keeps a walk honest) lands
with an entry in its site's `tests/mutations.json`: the text that breaks it
and the name of the test that must then fail. The run fails if that test
does not fail, if no test file names it, or if the text no longer appears
exactly once. A site that gains a `mutations.json` goes into the `mutate`
job's list in `.github/workflows/ci.yml`; `tests/repo.test.js` checks it is
there.

## Traps

**Reloading the extension is not enough.** A content script already injected
into an open tab keeps running the old code, so the store's tab needs
reloading too. A `manifest.json` change needs the extension reloaded.

**A saved page in happy-dom can reach the store.** Given the store's URL, the
window resolves the page's own stylesheets, scripts and images against it and
fetches them. Strip `<script>`, `<link>`, `<img>`, `src` and `url()` first,
give the window no URL, and turn its file loading off.

**Never hand `expect` a DOM node, or an object holding one.** A failing
`toEqual` or `toBe` makes bun print the whole happy-dom window; the run climbs
past 10 GB and never ends. Compare the plain fields, or `a === b` with `true`.

## Working with the other repositories

A CSV that can be sent is a contract with **mtgban-website**: every column is
named for how `internal/docparse`'s `ParseHeader` reads it. Changing one
without checking that file silently turns a resolved row into a name-matched
one, or a header holding "number" into the card's variant.

`/upload/handoff` takes a list only from the sites in its `handoff_origins`,
infrastructure config and not code. When a change here needs one there, land
the site side first: an extension that speaks a protocol the deployment does
not serve is broken in a way the person using it cannot fix.

Only public repositories are named in this one.

## Commits

One topic per commit; a plain imperative subject with no `area:` prefix,
wrapped at 80 columns, with the reasoning and what was measured in the body
rather than the diff. No `Co-Authored-By` lines. Pull requests off `master`,
merged by rebase.
