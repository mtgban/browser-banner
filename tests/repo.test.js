import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { manifest } from "./manifest.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sites = readdirSync(new URL("sites/", root)).filter((name) => statSync(new URL("sites/" + name, root)).isDirectory());

// files lists every file under dir, relative to the root, or nothing when
// dir does not exist.
function files(dir) {
  const at = new URL(dir + "/", root);
  if (!existsSync(at)) {
    return [];
  }
  return readdirSync(at).flatMap((name) => {
    const path = dir + "/" + name;
    return statSync(new URL(path, root)).isDirectory() ? files(path) : [path];
  });
}

// The store each site runs on, by the host its pages are served from.
const HOSTS = {
  cardmarket: "www.cardmarket.com",
  cardkingdom: "www.cardkingdom.com",
  tcgplayer: "store.tcgplayer.com",
  manapool: "manapool.com",
  starcitygames: "starcitygames.com",
};

describe("the manifest", () => {
  test("carries package.json's version", () => {
    expect(manifest.version).toBe(JSON.parse(read("package.json")).version);
  });

  test("asks for no permissions and hands the pages nothing", () => {
    for (const key of [
      "permissions",
      "optional_permissions",
      "host_permissions",
      "optional_host_permissions",
      "background",
      "web_accessible_resources",
    ]) {
      expect([key, manifest[key]]).toEqual([key, undefined]);
    }
  });

  test("runs on the stores' hosts and nowhere else", () => {
    const hosts = new Set(manifest.content_scripts.flatMap((cs) => cs.matches).map((match) => new URL(match.replace(/\*/g, "x")).host));
    expect([...hosts].sort()).toEqual(Object.values(HOSTS).sort());
  });

  // A manifest is what the browsers read; a typo in a path it names is a
  // broken install rather than a failing test.
  test("names only files that exist", () => {
    const named = Object.values(manifest.icons);
    for (const cs of manifest.content_scripts) {
      named.push(...(cs.js || []), ...(cs.css || []));
    }
    expect(named.filter((path) => !existsSync(new URL(path, root)))).toEqual([]);
  });

  test("gives each entry one site's files and core's, on that site's host", () => {
    const mixed = manifest.content_scripts.filter((cs) => {
      const owners = new Set(
        [...(cs.js || []), ...(cs.css || [])].filter((path) => !path.startsWith("core/")).map((path) => path.split("/").slice(0, 2).join("/"))
      );
      if (owners.size !== 1) return true;
      const site = [...owners][0].replace(/^sites\//, "");
      return !cs.matches.every((match) => new URL(match.replace(/\*/g, "x")).host === HOSTS[site]);
    });
    expect(mixed).toEqual([]);
  });
});

describe("the range picker", () => {
  // Unstyled, it is the store's own select: on ManaPool white on white, and
  // wide enough to push Download CSV out of the panel.
  test("is styled by the sheet every store shares, and by no store", () => {
    const loads = manifest.content_scripts.filter((cs) => cs.js.includes("core/ranges.js"));
    expect(loads.filter((cs) => !cs.css.includes("core/panel.css"))).toEqual([]);
    const rule = /\n#ban-panel \.ban-year \{([^}]*)\}/.exec(read("core/panel.css"));
    expect(rule && rule[1]).toMatch(/\n  appearance: none;/);
    for (const name of ["flex: none", "box-sizing: border-box", "width: \\d+px", "border: 0", "background: #", "color: #", "font: inherit"]) {
      expect(rule[1]).toMatch(new RegExp("\\n  " + name));
    }
    const styled = manifest.content_scripts.flatMap((cs) => cs.css).filter((path) => path !== "core/panel.css" && /\.ban-year[^+{]*\{/.test(read(path)));
    expect(styled).toEqual([]);
  });
});

describe("the sites", () => {
  test("are the stores, each with its own rules and specification", () => {
    expect([...sites].sort()).toEqual(Object.keys(HOSTS).sort());
    const missing = sites.flatMap((site) =>
      ["AGENTS.md", "SPECIFICATIONS.md"].map((name) => "sites/" + site + "/" + name).filter((path) => !existsSync(new URL(path, root))),
    );
    expect(missing).toEqual([]);
  });

  test("list their source files in AGENTS.md, and the root lists core's", () => {
    const listed = (path, dir) => [...read(path).matchAll(new RegExp("^" + dir + "/(\\S+\\.(?:js|css)) ", "gm"))].map((m) => m[1]).sort();
    const held = (dir) => files(dir).map((path) => path.slice(dir.length + 1)).sort();
    expect(listed("AGENTS.md", "core")).toEqual(held("core"));
    for (const site of sites) {
      expect([site, listed("sites/" + site + "/AGENTS.md", "src")]).toEqual([site, held("sites/" + site + "/src")]);
    }
  });

  test("are each named in the root's README and specification", () => {
    const unnamed = ["README.md", "SPECIFICATIONS.md"].flatMap((path) => sites.filter((site) => !read(path).includes("sites/" + site)).map((site) => path + " leaves out " + site));
    expect(unnamed).toEqual([]);
  });

  test("call no extension API", () => {
    // With no permissions there is nothing to call, and a call that slips
    // in would need one.
    const sources = [...files("core"), ...sites.flatMap((site) => files("sites/" + site + "/src"))];
    expect(sources.filter((path) => /\b(chrome|browser)\.\w/.test(read(path)))).toEqual([]);
  });

  test("core binds nothing of a store's, and keeps to BAN", () => {
    // A factory every store binds onto its own global: core touching
    // a store's global would be state one store's tests could leave behind
    // for another's.
    const touching = files("core")
      .filter((path) => path.endsWith(".js"))
      .filter((path) => /\b(MKM|CKB|TCGB|MPB|SCGB)\b/.test(read(path)) || /globalThis\.(?!BAN\b)\w+/.test(read(path)));
    expect(touching).toEqual([]);
  });

  test("core names no store", () => {
    const names = [...Object.values(HOSTS).map((host) => host.replace(/^(www|store)\./, "")), "Cardmarket", "Card Kingdom", "TCGplayer", "ManaPool", "Mana Pool", "Star City Games"];
    const naming = files("core").flatMap((path) => names.filter((name) => read(path).includes(name)).map((name) => path + " names " + name));
    expect(naming).toEqual([]);
  });

  test("name no store but their own", () => {
    const naming = sites.flatMap((site) =>
      files("sites/" + site + "/src").flatMap((path) =>
        Object.entries(HOSTS)
          .filter(([other]) => other !== site)
          .filter(([, host]) => read(path).includes(host.replace(/^(www|store)\./, "")))
          .map(([other]) => path + " names " + other),
      ),
    );
    expect(naming).toEqual([]);
  });
});

test("no em dash in the docs, the source or the manifest", () => {
  const names = [
    "README.md",
    "AGENTS.md",
    "SPECIFICATIONS.md",
    "manifest.json",
    "package.json",
    ...files("docs"),
    ...files("core"),
    ...files(".github"),
    ...files("scripts"),
    ...sites.flatMap((site) => [
      ...files("sites/" + site + "/src"),
      ...files("sites/" + site + "/scripts"),
      ...["README.md", "AGENTS.md", "SPECIFICATIONS.md"].map((name) => "sites/" + site + "/" + name).filter((path) => existsSync(new URL(path, root))),
    ]),
  ];
  const dashed = names.filter((path) => {
    const text = read(path);
    return text.includes("—") || text.includes("\\u2014") || text.includes("&mdash;");
  });
  expect(dashed).toEqual([]);
});

test("CI runs the guards of every site that has them, and no others", () => {
  const listed = /^\s*site: \[([^\]]*)\]$/m.exec(read(".github/workflows/ci.yml"));
  expect(listed).not.toBeNull();
  const ran = listed[1].split(",").map((site) => site.trim()).filter(Boolean).sort();
  const guarded = sites.filter((site) => existsSync(new URL("sites/" + site + "/tests/mutations.json", root))).sort();
  expect(ran).toEqual(guarded);
});

// A wait by the real clock ends early on a slow machine, and the check after
// it passes or fails for nothing. tests/clock.js is the clock a page gets.
// The files listed set a real timer to check what comes before it, or to fail
// a request later, and wait for none.
test("no site's tests sleep", () => {
  const timed = ["sites/cardkingdom/tests/net.test.js", "sites/cardkingdom/tests/store.test.js", "sites/cardkingdom/tests/walk.test.js", "sites/cardmarket/tests/pages.test.js"];
  const bare = /(?<![.\w])(setTimeout|setInterval)\(|\bBun\.sleep|\btimers\/promises\b|\b(globalThis|global)\.set(Timeout|Interval)\(/;
  const found = sites.flatMap((site) =>
    files("sites/" + site + "/tests")
      .filter((path) => path.endsWith(".js"))
      .filter((path) => bare.test(read(path))),
  );
  expect(found.sort()).toEqual(timed);
  const sleeping = timed.filter((path) => /await [^;]*(setTimeout|setInterval|Bun\.sleep(Sync)?)\(/.test(read(path)));
  expect(sleeping).toEqual([]);
});

// Every site's tests run in one process, and happy-dom shares element
// prototypes across windows: a stub set on one outlives the test and reaches
// the next site's, depending on the order bun happens to list the files in.
test("no site's tests patch a prototype", () => {
  const patching = sites.flatMap((site) =>
    files("sites/" + site + "/tests")
      .filter((path) => path.endsWith(".js"))
      .filter((path) => /\.prototype\.\w+\s*=[^=]/.test(read(path))),
  );
  expect(patching).toEqual([]);
});
