import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWikiLinks,
  normalizeTitle,
  wikiLinkPattern,
} from "@/lib/wiki-links";

test("links are extracted in the order written", () => {
  assert.deepEqual(parseWikiLinks("See [[Alpha]] then [[Beta]]."), [
    "Alpha",
    "Beta",
  ]);
});

test("the same target written differently is returned once, in its first spelling", () => {
  assert.deepEqual(parseWikiLinks("[[My Note]] and [[ my note ]]"), ["My Note"]);
});

test("titles compare with collapsed whitespace and case folded", () => {
  assert.equal(normalizeTitle("  My   Note "), "my note");
});

test("empty and unterminated links are ignored", () => {
  assert.deepEqual(parseWikiLinks("[[]] [[ ]] [[unclosed"), []);
});

test("a link cannot span a line break", () => {
  assert.deepEqual(parseWikiLinks("[[Alpha\nBeta]]"), []);
});

test("each call gets a fresh pattern, so matching is not order-dependent", () => {
  const text = "[[One]] [[Two]]";
  const first = [...text.matchAll(wikiLinkPattern())].length;
  const second = [...text.matchAll(wikiLinkPattern())].length;
  assert.equal(first, 2);
  assert.equal(second, 2);
});
