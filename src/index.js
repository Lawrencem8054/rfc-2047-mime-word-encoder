/**
 * Public entry point for rfc-2047-mime-word-encoder.
 *
 * Re-exports the small, stable surface that callers depend on so the core
 * module can be refactored without breaking consumers.
 */

export { encodeWord, needsEncoding } from './core.js';
