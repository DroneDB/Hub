/** sha256Hex: the published SHA-256 vectors (literals from hashlib, not computed by the code under test). */
import { describe, it, expect } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
    it('hashes the empty text and "abc"', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('hashes UTF-8, not UTF-16 code units', () => {
        expect(sha256Hex('caffè ☕')).toBe('8b284d2dc1b074fd2160218662b9a7297fa69e9eeb3e067fa86de1fac67500f8');
    });

    it('hashes a text of several blocks (and one that ends a block boundary)', () => {
        expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
        // 55 bytes: the padding fits the block; 56 bytes: it needs another one
        expect(sha256Hex('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
        expect(sha256Hex('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    });
});
