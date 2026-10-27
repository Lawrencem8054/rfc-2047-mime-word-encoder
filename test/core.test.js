import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeWord, needsEncoding } from '../src/index.js';

// RFC 2047's canonical example phrase — the one real-world message the spec
// itself uses to show base64 encoded words.
test('encodeWord encodes a simple non-ASCII string as base64 (RFC 2047 §8)', () => {
  assert.strictEqual(
    encodeWord('Keith Moore'),
    '=?utf-8?B?S2VpdGggTW9vcmU=?='
  );
});

test('encodeWord produces the documented Q-encoding example (RFC 2047 §8)', () => {
  assert.strictEqual(
    encodeWord('Keith Moore', 'Q'),
    '=?utf-8?Q?Keith_Moore?='
  );
});

test('needsEncoding returns false for plain ASCII without control bytes', () => {
  assert.equal(needsEncoding('Keith Moore'), false);
  assert.equal(needsEncoding(''), false);
});

test('needsEncoding returns true for non-ASCII text', () => {
  assert.equal(needsEncoding('café'), true);
  assert.equal(needsEncoding('日本語'), true);
});

test('needsEncoding flags leading/trailing whitespace', () => {
  assert.equal(needsEncoding(' hi'), true);
  assert.equal(needsEncoding('hi '), true);
});

test('needsEncoding flags ASCII control bytes', () => {
  assert.equal(needsEncoding('a\u0001b'), true);
  assert.equal(needsEncoding('tab\there'), true); // tab is 0x09, a control byte below 0x20
});

test('encodeWord uses an explicit charset label when provided', () => {
  assert.strictEqual(
    encodeWord('Keith Moore', 'B', 'iso-8859-1'),
    '=?iso-8859-1?B?S2VpdGggTW9vcmU=?='
  );
});

test('encodeWord Q-encodes literal question marks and equals signs', () => {
  // '?' and '=' are structurally significant inside encoded-words and MUST be
  // encoded even though they are otherwise printable in QP.
  assert.strictEqual(
    encodeWord('a?b=c', 'Q'),
    '=?utf-8?Q?a=3Fb=3Dc?='
  );
});

test('encodeWord encodes spaces as underscores in Q mode', () => {
  assert.strictEqual(
    encodeWord('a b c', 'Q'),
    '=?utf-8?Q?a_b_c?='
  );
});

test('encodeWord preserves a single 3-byte UTF-8 BMP character in B mode', () => {
  // 'é' = U+00E9 -> UTF-8 C3 A9 -> base64 'w6k='
  assert.strictEqual(encodeWord('é', 'B'), '=?utf-8?B?w6k=?=');
});

test('encodeWord handles a 4-byte UTF-8 character (astral plane)', () => {
  // U+1F600 (😀) -> UTF-8 F0 9F 98 80 -> base64 '8J+YgA=='
  assert.strictEqual(encodeWord('😀', 'B'), '=?utf-8?B?8J+YgA==?=');
});

test('encodeWord throws on an unsupported encoding scheme', () => {
  assert.throws(
    () => encodeWord('hi', 'X'),
    /Unsupported encoding scheme/
  );
});

test('encodeWord replaces a lone surrogate with U+FFFD to keep output valid UTF-8', () => {
  // Lone high surrogate U+D800 is not a valid code point; replacing it with
  // U+FFFD yields UTF-8 EF BF BD -> base64 '77+9'.
  const got = encodeWord('\uD800', 'B');
  assert.strictEqual(got, '=?utf-8?B?77+9?=');
});
