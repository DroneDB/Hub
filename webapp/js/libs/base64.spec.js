import { describe, it, expect } from 'vitest';
import { b64encode, b64urlEncode, b64urlDecode } from './base64';

describe('base64url', () => {
    it('round-trips ASCII and non-ASCII text', () => {
        for (const text of ['', 'a', 'flights/ortho.tif', 'città – 日本語 🚁', 'a b&c=d?e#f']) {
            expect(b64urlDecode(b64urlEncode(text))).toBe(text);
        }
    });

    it('uses - and _ instead of + and /, and no padding', () => {
        // These bytes encode to "+/" in standard base64
        const text = 'ûÿ?>';
        expect(b64encode(text)).toMatch(/[+/]/);
        const encoded = b64urlEncode(text);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(encoded).toMatch(/[-_]/);
        expect(b64urlDecode(encoded)).toBe(text);
    });

    it('drops the padding the standard encoding adds', () => {
        expect(b64encode('a')).toBe('YQ==');
        expect(b64urlEncode('a')).toBe('YQ');
    });

    it('decodes with the padding missing or present', () => {
        expect(b64urlDecode('YQ')).toBe('a');
        expect(b64urlDecode('YQ==')).toBe('a');
    });

    it('throws on characters outside the alphabet', () => {
        expect(() => b64urlDecode('a+b')).toThrow();
        expect(() => b64urlDecode('a/b')).toThrow();
        expect(() => b64urlDecode('ab cd')).toThrow();
        expect(() => b64urlDecode('!!!!')).toThrow();
    });

    it('throws on a length that cannot be base64', () => {
        expect(() => b64urlDecode('Y')).toThrow();
    });

    it('throws on bytes that are not UTF-8', () => {
        expect(() => b64urlDecode(window.btoa('\xff\xfe').replace(/=+$/, ''))).toThrow();
    });
});
