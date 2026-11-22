// The extension's one manifest, and the part of it each site's tests load.
//
// Every site's tests run in one process, so a harness that evaluated every
// entry would stand the other stores up in its window too. siteManifest
// keeps only the entries whose files are the site's own, with their paths
// relative to the site, which is what its harness and tests read.

import { readFileSync } from "fs";

export const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

export function siteManifest(site) {
  const prefix = "sites/" + site + "/";
  const files = (entry) => [...(entry.js || []), ...(entry.css || [])];
  const strip = (paths) => (paths || []).map((path) => path.slice(prefix.length));
  return {
    ...manifest,
    content_scripts: manifest.content_scripts
      .filter((entry) => files(entry).every((path) => path.startsWith(prefix)))
      .map((entry) => ({ ...entry, js: strip(entry.js), css: strip(entry.css) })),
  };
}
