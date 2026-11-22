// Breaks each guard in a site's tests/mutations.json in turn and checks the
// site's suite notices: every mutation must fail the test it names.
//
//   bun scripts/mutate.mjs [sites/<store> ...]
//
// With no site named, it runs every site that has a mutations.json.
//
// It works on a copy of the repository in a temporary directory, so the
// working tree is never touched; a site's tests read the root manifest, so the
// copy is the whole repository rather than the site. It holds what git would
// track (ignored files, saved pages among them, stay put), with node_modules
// linked in. The site's whole suite runs once, unmutated; each mutation then
// runs only the test it names, in the files that hold it, since no other test
// can report it.

import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bun = process.versions.bun ? process.execPath : "bun";

// guarded is every site with a mutations.json.
function guarded() {
  return readdirSync(join(root, "sites"))
    .map((name) => join("sites", name))
    .filter((site) => existsSync(join(root, site, "tests/mutations.json")));
}

function pattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// tracked is what git would track under dir, relative to it.
function tracked(dir) {
  const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (listed.status !== 0) {
    throw new Error("git ls-files failed: " + listed.stderr);
  }
  return listed.stdout.split("\0").filter((name) => name && existsSync(join(dir, name)));
}

// LIMIT bounds one run of the suite, which takes seconds; a mutation that
// makes it hang must fail the runner rather than stall it.
const LIMIT = 120000;

// run answers with a test run's exit status and the names of its failed
// tests; args picks what runs, the whole suite by default.
function run(dir, args = ["tests/"]) {
  const result = spawnSync(bun, ["test", ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: LIMIT,
    // A failed expect can print a whole DOM node; the default 1 MB would cut
    // the output, and with it the test's name.
    maxBuffer: 1 << 28,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    return { status: null, failed: [], output: "", timedOut: true };
  }
  if (result.error) {
    throw new Error("could not run bun test: " + result.error.message);
  }
  const output = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const failed = output.split("\n").filter((line) => line.startsWith("(fail)"));
  return { status: result.status, failed, output };
}

// mutate runs one site's guards and answers with how many it missed.
function mutate(site) {
  const dir = resolve(root, site);
  const name = basename(dir);
  const mutations = JSON.parse(readFileSync(join(dir, "tests/mutations.json"), "utf8"));
  const testFiles = readdirSync(join(dir, "tests"))
    .filter((file) => file.endsWith(".test.js"))
    .map((file) => "tests/" + file);
  // holding is the test files whose source names a test.
  const holding = (test) => testFiles.filter((file) => readFileSync(join(dir, file), "utf8").includes(test));

  const repo = mkdtempSync(join(tmpdir(), "browser-banner-" + name + "-"));
  const copy = join(repo, relative(root, dir));
  let missed = 0;
  try {
    for (const file of tracked(root)) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      cpSync(join(root, file), join(repo, file));
    }
    symlinkSync(join(root, "node_modules"), join(repo, "node_modules"));

    const clean = run(copy);
    if (clean.timedOut || clean.status !== 0) {
      console.error(clean.output);
      throw new Error(site + ": the suite fails before anything is mutated");
    }

    for (const m of mutations) {
      const files = holding(m.expectFailing);
      if (!files.length) {
        console.log(`UNKNOWN  ${name}: ${m.guard}: no test file names "${m.expectFailing}"`);
        missed++;
        continue;
      }
      const file = join(copy, m.file);
      const original = readFileSync(file, "utf8");
      const found = original.split(m.find).length - 1;
      if (found !== 1) {
        // A list that no longer matches the code must not pass quietly.
        console.log(`STALE    ${name}: ${m.guard}: found ${found} times in ${m.file}`);
        missed++;
        continue;
      }
      writeFileSync(file, original.replace(m.find, () => m.replace));
      const result = run(copy, [...files, "-t", pattern(m.expectFailing)]);
      writeFileSync(file, original);

      if (result.status !== 0 && result.failed.some((line) => line.includes(m.expectFailing))) {
        console.log(`caught   ${name}: ${m.guard}`);
        continue;
      }
      missed++;
      if (result.timedOut) {
        console.log(`TIMED OUT ${name}: ${m.guard}: the test did not finish in ${LIMIT / 1000} s`);
        continue;
      }
      if (result.status !== 0 && result.failed.length === 0) {
        console.log(`BROKEN   ${name}: ${m.guard}: the test did not run; is the replacement valid code?`);
        continue;
      }
      console.log(`SURVIVED ${name}: ${m.guard}: no failing test named "${m.expectFailing}"`);
      for (const line of result.failed) {
        console.log("         " + line);
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  console.log(`${name}: ${mutations.length - missed} of ${mutations.length} mutations caught`);
  return missed;
}

const sites = process.argv.length > 2 ? process.argv.slice(2) : guarded();
if (!sites.length) {
  throw new Error("no site has a tests/mutations.json");
}
let missed = 0;
for (const site of sites) {
  if (!existsSync(join(resolve(root, site), "tests/mutations.json"))) {
    throw new Error(site + " has no tests/mutations.json");
  }
  missed += mutate(site);
}
process.exitCode = missed ? 1 : 0;
