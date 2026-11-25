# AGENTS.md

Guidance for AI coding agents working on **browser-banner**. Each store's
extension lives under `sites/<store>/` with its own `AGENTS.md` and
`SPECIFICATIONS.md`: read the ones for the store you touch before changing
it, and follow them. Their rules hold here unchanged. `SPECIFICATIONS.md` at
the root says what the stores share and what the whole extension promises.

What holds for the whole repository:

- **Verify against a saved page of the store, not against a fixture.** Saved
  pages carry the visitor's session and are never committed as they are;
  each site's AGENTS.md says how to cut a fixture from one.
- **No permissions, no background script, no web-accessible files.** A site
  runs on its own store's host and nowhere else.
- **Never answer a Cloudflare challenge in code**, and never fan out
  requests: one page at a time, with a wait before each.
- **`core/` holds what every store shares**, as factories on `globalThis.BAN`
  that each store binds onto its own global (`MKM`, `CKB`, `TCGB`, `MPB`,
  `SCGB`).
  Nothing in `core/` keeps state, names a store or touches a store's global;
  a root test holds it to that.
- **Do not guess at a price, an id or a card.** A row that cannot be
  resolved carries an empty column and the panel says how many.
- **Do not write an em dash**, anywhere: `tests/repo.test.js` checks the
  root docs and `docs/`, each site's tests check its own.

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
guard in every site's `tests/mutations.json` in turn, as CI does. `bun run
mutate sites/<store>` runs one site's guards.

A guard (a refusal, a strict shape, a check that keeps a walk honest) lands
with an entry in its site's `tests/mutations.json`: the text that breaks it
and the name of the test that must then fail. The run fails if that test
does not fail, if no test file names it, or if the text no longer appears
exactly once. A site that gains a `mutations.json` goes into the `mutate`
job's list in `.github/workflows/ci.yml`; `tests/repo.test.js` checks it is
there.

## Commits

One topic per commit, wrapped at 80 columns, with the reasoning in the body
rather than the diff. No `Co-Authored-By` lines.
