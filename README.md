# rfc-2047-mime-word-encoder

Encodes non-ASCII text into RFC 2047 encoded-word strings for use in MIME message headers. Pure JavaScript, zero runtime dependencies, ESM only.

## Usage

```js
import { encodeWord, needsEncoding } from 'rfc-2047-mime-word-encoder';

encodeWord('Keith Moore');        // '=?utf-8?B?S2VpdGggTW9vcmU=?='
encodeWord('Keith Moore', 'Q');   // '=?utf-8?Q?Keith_Moore?='
encodeWord('café', 'B', 'iso-8859-1');
// '=?iso-8859-1?B?Y2Fmw6k=?='

needsEncoding('café');  // true
needsEncoding('plain'); // false
```

## Why this exists

MIME headers are ASCII-only by design. The moment you need to put a non-ASCII
subject, From name, or any other internationalized header field into a
message, RFC 2047 is the standard escape hatch: wrap the offending text in a
token like `=?utf-8?B?...?=`, and a conformant parser will decode it back to
the original text.

This library only encodes. It does not decode, fold long lines, or pick the
shortest representation between B and Q encodings. The decision to keep the
surface this small is deliberate: every one of those features is a source of
interop bugs, and most callers only need to emit a single encoded word and
trust the surrounding mail library to fold it. If you need line-length
folding, do it afterward on the produced string.

## The awkward edge

Inside a `=?...?=` word, the literal characters `?` and `=` are structurally
significant. In Q mode this library therefore encodes them as `=3F` and
`=3D` even though they are otherwise printable ASCII in RFC 2045
quoted-printable. Spaces are encoded as `_`, not `=20`. If you pass a string
with leading or trailing whitespace, `needsEncoding` will flag it for
encoding — unencoded surrounding whitespace inside an encoded word is
ambiguous on the wire.

Lone UTF-16 surrogates in the input string are replaced with U+FFFD before
encoding so that the emitted bytes are always valid UTF-8, regardless of how
the caller constructed the string.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

