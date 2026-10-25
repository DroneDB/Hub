import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
    it('renders Markdown to HTML', () => {
        expect(renderMarkdown('**b**')).toContain('<strong>b</strong>');
        expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
    });

    it('returns an empty string for no text', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown(null)).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
    });

    it('turns scripts and event handlers in the source into text, not elements', () => {
        const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror="alert(1)"> text');
        expect(html).not.toMatch(/<(script|img)/);
        expect(html).toContain('&lt;script&gt;');
    });

    it('does not make a link of a javascript: address', () => {
        const html = renderMarkdown('[click](javascript:alert(1)) [ok](https://example.com)');
        expect(html).not.toMatch(/href="javascript:/);
        expect(html).toContain('href="https://example.com"');
    });

    it('keeps images by default', () => {
        expect(renderMarkdown('![logo](https://example.com/a.png)')).toContain('<img');
    });

    it('renders an image as its alt text when images are not allowed', () => {
        const html = renderMarkdown('before ![a <b>logo</b>](https://example.com/a.png) after', { allowImages: false });
        expect(html).not.toContain('<img');
        expect(html).not.toContain('example.com');
        expect(html).toContain('a &lt;b&gt;logo&lt;/b&gt;');
    });

    it('keeps links and formatting when images are not allowed', () => {
        const html = renderMarkdown('[docs](https://example.com) and *em*', { allowImages: false });
        expect(html).toContain('>docs</a>');
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain('<em>em</em>');
    });

    it('opens the links of a text from outside in a new tab that cannot reach the Hub', () => {
        const html = renderMarkdown('[docs](https://example.com) <http://example.org/a>', { allowImages: false });
        const links = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a')];
        expect(links.map(a => a.getAttribute('href'))).toEqual(['https://example.com', 'http://example.org/a']);
        for (const a of links) {
            expect(a.getAttribute('target')).toBe('_blank');
            expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        }
    });

    it('makes links of web addresses only in a text from outside', () => {
        const html = renderMarkdown('[mail](mailto:a@b.test) [here](/admin/users) [js](javascript:alert(1)) [ftp](ftp://x.test/f)',
            { allowImages: false });
        expect(html).not.toContain('<a');
    });

    it('leaves the links of the viewer as they were', () => {
        const html = renderMarkdown('[docs](https://example.com) [here](/admin/users)');
        expect(html).toContain('<a href="https://example.com">docs</a>');
        expect(html).toContain('<a href="/admin/users">here</a>');
    });
});
