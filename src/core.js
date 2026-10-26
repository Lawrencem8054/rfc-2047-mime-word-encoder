/**
 * Core encoding logic for RFC 2047 MIME encoded-word generation.
 *
 * RFC 2047 allows non-ASCII text to appear in RFC 822 message headers by wrapping
 * it in a delimited token of the form `=?<charset>?<encoding>?<encoded-text>?=`.
 * This module produces two encodings:
 *
 *   - 'B' (Base64) — compact, preferred for most non-ASCII text.
 *   - 'Q' (Quoted-Printable variant) — more readable for text that is mostly ASCII
 *     with a few special characters; leaves printable ASCII bytes intact except
 *     for `?`, `=`, space, and control characters.
 *
 * Why a separate module: the index module re-exports a small public API, while
 * this file holds the pure, side-effect-free encoding functions so they can be
 * unit-tested in isolation.
 */

// Base64 alphabet specified by RFC 2045 (Section 6.8). RFC 2047's 'B' encoding
// is literally base64 — no variant — so we hardcode the standard table.
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64-encode an arbitrary byte sequence with mandatory padding.
 *
 * Why hand-rolled: Node's `Buffer` provides base64 but this logic is trivial,
 * has zero platform coupling, and behaves identically in any engine.
 */
function base64Encode(bytes) {
  const out = [];
  const len = bytes.length;
  const fullBlocks = Math.floor(len / 3);

  for (let block = 0; block < fullBlocks; block++) {
    const i = block * 3;
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out.push(BASE64_ALPHABET[(triplet >> 18) & 0x3f]);
    out.push(BASE64_ALPHABET[(triplet >> 12) & 0x3f]);
    out.push(BASE64_ALPHABET[(triplet >> 6) & 0x3f]);
    out.push(BASE64_ALPHABET[triplet & 0x3f]);
  }

  const rem = len - fullBlocks * 3;
  if (rem === 0) {
    return out.join('');
  }

  const i = fullBlocks * 3;
  const b0 = bytes[i];
  const b1 = rem === 2 ? bytes[i + 1] : 0;
  const triplet = (b0 << 16) | (b1 << 8);
  out.push(BASE64_ALPHABET[(triplet >> 18) & 0x3f]);
  out.push(BASE64_ALPHABET[(triplet >> 12) & 0x3f]);
  if (rem === 2) {
    out.push(BASE64_ALPHABET[(triplet >> 6) & 0x3f]);
    out.push('=');
  } else {
    out.push('=');
    out.push('=');
  }

  return out.join('');
}

/**
 * RFC 2047 'Q' encoding for a single byte sequence.
 *
 * Differences from RFC 2045 quoted-printable:
 *   - Space (0x20) becomes `_` (underscore), not `=20`.
 *   - The literal characters `?` and `=` MUST be encoded (they delimit / escape
 *     within an encoded-word), even though they are printable in normal QP.
 *   - Printable ASCII letters, digits, and most punctuation pass through
 *     unencoded, which keeps common words readable.
 *
 * Returns the encoded text only — no `=?...?=` wrapper.
 */
function qEncode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0x20) {
      out += '_';
    } else if (
      (byte >= 0x21 && byte <= 0x7e) &&
      byte !== 0x3f && // '?'
      byte !== 0x3d && // '='
      byte !== 0x5f && // '_' — encoded to avoid ambiguity with encoded space
      byte !== 0x5e    // '^' — reserved per RFC 2047's q-list, encode defensively
    ) {
      out += String.fromCharCode(byte);
    } else {
      out += '=' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

/**
 * Convert a JS string into its UTF-8 byte sequence.
 *
 * Standard RFC 3629 algorithm. We handle the full surrogate-pair range up to
 * U+10FFFF; lone surrogates are replaced with U+FFFD to keep output valid UTF-8.
 */
function utf8Bytes(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    let codePoint = str.charCodeAt(i++);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      if (i < str.length) {
        const low = str.charCodeAt(i);
        if (low >= 0xdc00 && low <= 0xdfff) {
          i++;
          codePoint =
            0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        } else {
          // Lone high surrogate — replace to keep output valid UTF-8.
          codePoint = 0xfffd;
        }
      } else {
        // Lone high surrogate at end of string — replace.
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      // Lone low surrogate — same treatment.
      codePoint = 0xfffd;
    }

    if (codePoint < 0x80) {
      out.push(codePoint);
    } else if (codePoint < 0x800) {
      out.push(0xc0 | (codePoint >> 6));
      out.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      out.push(0xe0 | (codePoint >> 12));
      out.push(0x80 | ((codePoint >> 6) & 0x3f));
      out.push(0x80 | (codePoint & 0x3f));
    } else {
      out.push(0xf0 | (codePoint >> 18));
      out.push(0x80 | ((codePoint >> 12) & 0x3f));
      out.push(0x80 | ((codePoint >> 6) & 0x3f));
      out.push(0x80 | (codePoint & 0x3f));
    }
  }
  return out;
}

/**
 * Encode a string as a single RFC 2047 encoded word using the given scheme.
 *
 * @param {string} text       Source text; any JS string. Lone surrogates are
 *                            replaced with U+FFFD so output is always valid UTF-8.
 * @param {'B'|'Q'} [scheme='B'] Encoding scheme. 'B' = base64, 'Q' = Q-encoding.
 * @param {string} [charset='utf-8'] Charset label placed in the encoded word.
 *                                  No normalization is performed; the caller is
 *                                  responsible for using an IANA-registered name.
 * @returns {string} An encoded word of the form `=?<charset>?<scheme>?<data>?=`.
 */
export function encodeWord(text, scheme = 'B', charset = 'utf-8') {
  const normalizedScheme = String(scheme || 'B').toUpperCase();
  if (normalizedScheme !== 'B' && normalizedScheme !== 'Q') {
    throw new TypeError(
      `Unsupported encoding scheme '${scheme}'. Supported schemes: 'B' or 'Q'.`
    );
  }

  const label = String(charset || 'utf-8').toLowerCase();
  const bytes = utf8Bytes(String(text));
  const encoded =
    normalizedScheme === 'B' ? base64Encode(bytes) : qEncode(bytes);

  return `=?${label}?${normalizedScheme}?${encoded}?=`;
}

/**
 * Decide whether a string needs RFC 2047 encoding at all.
 *
 * ASCII with no control bytes and no trailing whitespace does not need
 * wrapping. Everything else — any non-ASCII byte, embedded NULs, or leading /
 * trailing spaces — requires an encoded-word to remain legal inside a header.
 */
export function needsEncoding(text) {
  const str = String(text);
  if (str.length === 0) {
    return false;
  }
  if (str.charCodeAt(0) === 0x20 || str.charCodeAt(str.length - 1) === 0x20) {
    return true;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0x7e || code < 0x20) {
      return true;
    }
  }
  return false;
}
