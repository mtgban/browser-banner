import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "fs";

const root = new URL("../", import.meta.url);

test("no em dash in the repository's own docs", () => {
  const names = ["README.md", "AGENTS.md"];
  if (existsSync(new URL("docs/", root))) {
    names.push(...readdirSync(new URL("docs/", root)).map((name) => "docs/" + name));
  }
  const dashed = names.filter((name) => readFileSync(new URL(name, root), "utf8").includes("—"));
  expect(dashed).toEqual([]);
});

test("every site keeps its own rules and specification", () => {
  const sites = readdirSync(new URL("sites/", root));
  expect(sites.length).toBeGreaterThan(0);
  const missing = sites.flatMap((site) =>
    ["AGENTS.md", "SPECIFICATIONS.md", "manifest.json"]
      .map((name) => "sites/" + site + "/" + name)
      .filter((path) => !existsSync(new URL(path, root))),
  );
  expect(missing).toEqual([]);
});

test("every site's manifest carries package.json's version", () => {
  const version = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version;
  const off = readdirSync(new URL("sites/", root))
    .filter((site) => existsSync(new URL("sites/" + site + "/manifest.json", root)))
    .filter((site) => JSON.parse(readFileSync(new URL("sites/" + site + "/manifest.json", root), "utf8")).version !== version);
  expect(off).toEqual([]);
});

test("CI runs the guards of every site that has them, and no others", () => {
  const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  const listed = /^\s*site: \[([^\]]*)\]$/m.exec(ci);
  expect(listed).not.toBeNull();
  const ran = listed[1].split(",").map((site) => site.trim()).filter(Boolean).sort();
  const guarded = readdirSync(new URL("sites/", root))
    .filter((site) => existsSync(new URL("sites/" + site + "/tests/mutations.json", root)))
    .sort();
  expect(ran).toEqual(guarded);
});

// A manifest is what the browsers read; a typo in a path it names is a broken
// install rather than a failing test, so every site's is checked here.
test("every manifest names only files that exist", () => {
  const missing = readdirSync(new URL("sites/", root))
    .filter((site) => existsSync(new URL("sites/" + site + "/manifest.json", root)))
    .flatMap((site) => {
      const manifest = JSON.parse(readFileSync(new URL("sites/" + site + "/manifest.json", root), "utf8"));
      const named = Object.values(manifest.icons || {});
      for (const cs of manifest.content_scripts || []) {
        named.push(...(cs.js || []), ...(cs.css || []));
      }
      return named.map((name) => "sites/" + site + "/" + name).filter((path) => !existsSync(new URL(path, root)));
    });
  expect(missing).toEqual([]);
});

// Every site's tests run in one process, and happy-dom shares element
// prototypes across windows: a stub set on one outlives the test and reaches
// the next site's, depending on the order bun happens to list the files in.
test("no site's tests patch a prototype", () => {
  const patching = readdirSync(new URL("sites/", root)).flatMap((site) => {
    const dir = new URL("sites/" + site + "/tests/", root);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".js"))
      .filter((name) => /\.prototype\.\w+\s*=[^=]/.test(readFileSync(new URL(name, dir), "utf8")))
      .map((name) => "sites/" + site + "/tests/" + name);
  });
  expect(patching).toEqual([]);
});
