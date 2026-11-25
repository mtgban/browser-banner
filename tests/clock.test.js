// The clock a page's tests run on.

import { test, expect, describe } from "bun:test";
import { Window } from "happy-dom";
import { clock } from "./clock.js";

const page = () => {
  const window = new Window();
  return { window, time: clock(window) };
};

describe("a page's clock", () => {
  test("fires what falls due in the time that passes, in order, and nothing later", async () => {
    const { window, time } = page();
    const fired = [];
    window.setTimeout(() => fired.push("b"), 20);
    window.setTimeout(() => fired.push("a"), 10);
    window.setTimeout(() => fired.push("later"), 31);
    window.clearTimeout(window.setTimeout(() => fired.push("cleared"), 5));
    const every = window.setInterval(() => fired.push("i"), 12);
    await time.settle(30);
    expect(fired).toEqual(["a", "i", "b", "i"]);
    window.clearInterval(every);
    await time.settle(1);
    expect(fired).toEqual(["a", "i", "b", "i", "later"]);
  });

  test("is what the page's Date.now says, and starts no earlier than the page before", async () => {
    const { window, time } = page();
    const before = window.Date.now();
    await time.settle(5000);
    expect(window.Date.now()).toBe(before + 5000);
    const next = new Window();
    clock(next, time);
    expect(next.Date.now()).toBeGreaterThanOrEqual(before + 5000);
  });

  test("until waits for work that is no timer, longer than one settle lets it run", async () => {
    const { time } = page();
    let turns = 500;
    (function turn() {
      if (--turns) setImmediate(turn);
    })();
    await time.until(() => turns === 0);
    expect(turns).toBe(0);
  });

  test("until says whether time ran out or nothing was left", async () => {
    const { window, time } = page();
    await expect(time.until(() => false)).rejects.toThrow("nothing left to run");
    window.setTimeout(() => {}, 20000);
    await expect(time.until(() => false)).rejects.toThrow("10000 ms passed");
  });
});
