import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { siteManifest } from "../../../tests/manifest.js";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const manifest = siteManifest("starcitygames");

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

  test("runs on Star City Games' account pages alone", () => {
    expect(manifest.content_scripts.flatMap((cs) => cs.matches)).toEqual(["https://starcitygames.com/account.php*"]);
  });
});

describe("the source", () => {
  test("names no site, asking only Star City Games' own paths", () => {
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
      if (/eyJ[\w-]{10,}\./.test(body)) leaks.push(name + ": a token");
      if (/address|comments|customer|shipping_method/i.test(body)) leaks.push(name + ": more of the order than is read");
      for (const m of body.matchAll(/order_id=(\d+)|"id\\":(\d+)|Order #(\d+)/g)) {
        const id = m[1] || m[2] || m[3];
        if (!/^10000\d\d$/.test(id)) leaks.push(name + ": a real order number, " + id);
      }
      for (const m of body.matchAll(/Coupon Code \(([^)]*)\)/g)) {
        if (m[1] !== "EXAMPLE") leaks.push(name + ": a coupon's code, " + m[1]);
      }
    }
    expect(leaks).toEqual([]);
  });
});
