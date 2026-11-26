import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { siteManifest } from "../../../tests/manifest.js";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const manifest = siteManifest("manapool");

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

describe("the manifest", () => {
  test("names only files that exist", () => {
    const named = manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]);
    expect(named.filter((name) => !existsSync(new URL(name, root)))).toEqual([]);
  });

  test("runs on ManaPool alone, every page of it, since ManaPool moves between pages without loading them", () => {
    expect(manifest.content_scripts.flatMap((cs) => cs.matches)).toEqual(["https://manapool.com/*"]);
  });
});

describe("the source", () => {
  test("calls no extension API", () => {
    expect(files("src").filter((name) => /\b(chrome|browser)\.\w/.test(read(name)))).toEqual([]);
  });

  test("names no site, asking only ManaPool's own paths", () => {
    const urls = files("src").flatMap((name) => [...read(name).matchAll(/https?:\/\/[^/"'\s)\\]+/g)].map((m) => name + ": " + m[0]));
    expect(urls).toEqual([]);
  });
});

describe("the fixtures", () => {
  test("carry no real account's data", () => {
    const leaks = [];
    for (const name of files("tests/fixtures")) {
      const body = read(name);
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) leaks.push(name + ": an email address");
      for (const m of body.matchAll(/"seller_username":\s*"([^"]*)"/g)) {
        if (!/^Seller [A-Z]$/.test(m[1])) leaks.push(name + ": a real seller, " + m[1]);
      }
      for (const m of body.matchAll(/"(?:order_number|buyerLabelNumber)":\s*"?(\d+)/g)) {
        if (!/^1\d{3}$/.test(m[1])) leaks.push(name + ": a real order number, " + m[1]);
      }
    }
    expect(leaks).toEqual([]);
  });
});
