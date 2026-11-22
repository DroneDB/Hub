import { describe, it, expect } from 'vitest';
import { isOriginUrl } from '@/libs/originUrl';

describe('isOriginUrl', () => {
    const origin = 'https://hub.example';
    it('accepts an address of the origin', () => {
        expect(isOriginUrl('https://hub.example/r/a/b/reports/c#item-1', origin)).toBe(true);
    });
    it('refuses another host, scheme, port, a lookalike host and what is not an address', () => {
        for (const url of ['https://evil.example/r', 'http://hub.example/r', 'https://hub.example:8443/r', 'https://hub.example.evil.example/r',
            'https://hub.example@evil.example/r', 'javascript:alert(1)', '/r/a/b', '', null, undefined, 42]) {
            expect(isOriginUrl(url, origin), String(url)).toBe(false);
        }
    });
    it('uses the origin of the page by default', () => {
        expect(isOriginUrl(`${window.location.origin}/x`)).toBe(true);
        expect(isOriginUrl('https://evil.example/x')).toBe(false);
    });
});
