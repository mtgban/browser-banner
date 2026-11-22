// Who the handoff will talk to. The cart posts its lines to whichever origin
// answers, so this is where a wrong answer would leak them.

import { test, expect, describe } from "bun:test";
import { CKB } from "./helpers.js";

describe("an mtgban origin", () => {
  test("is mtgban.com or a subdomain of it, over https", () => {
    expect(CKB.isBanHost("https://mtgban.com")).toBe(true);
    expect(CKB.isBanHost("https://www.mtgban.com")).toBe(true);
  });

  test("is not a name that only ends in mtgban.com", () => {
    expect(CKB.isBanHost("https://evilmtgban.com")).toBe(false);
    expect(CKB.isBanHost("https://mtgban.com.evil.example")).toBe(false);
  });

  test("is not one over plain http", () => {
    expect(CKB.isBanHost("http://mtgban.com")).toBe(false);
    expect(CKB.isBanHost("http://www.mtgban.com")).toBe(false);
  });

  test("is not something that is no origin at all", () => {
    expect(CKB.isBanHost("null")).toBe(false);
    expect(CKB.isBanHost("")).toBe(false);
  });
});

describe("the handoff page", () => {
  test("is Magic's, and no other game has one", () => {
    expect(CKB.handoffURL("magic")).toBe("https://mtgban.com/upload/handoff");
    expect(CKB.handoffURL("pokemon")).toBe("");
  });
});
