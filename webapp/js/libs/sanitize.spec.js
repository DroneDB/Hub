/**
 * Unit tests for libs/sanitize.js
 * Verifies XSS protection in HTML sanitization.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
    it('returns empty string for null/undefined/empty', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml(undefined)).toBe('');
        expect(sanitizeHtml('')).toBe('');
    });

    it('allows safe tags', () => {
        expect(sanitizeHtml('<b>bold</b>')).toBe('<b>bold</b>');
        expect(sanitizeHtml('<i>italic</i>')).toBe('<i>italic</i>');
        expect(sanitizeHtml('<strong>strong</strong>')).toBe('<strong>strong</strong>');
        expect(sanitizeHtml('<a href="https://example.com">link</a>')).toBe('<a href="https://example.com">link</a>');
        expect(sanitizeHtml('<p>paragraph</p>')).toBe('<p>paragraph</p>');
        expect(sanitizeHtml('<br>')).toBe('<br>');
        expect(sanitizeHtml('<ul><li>item</li></ul>')).toBe('<ul><li>item</li></ul>');
        expect(sanitizeHtml('<code>code</code>')).toBe('<code>code</code>');
        expect(sanitizeHtml('<pre>pre</pre>')).toBe('<pre>pre</pre>');
        expect(sanitizeHtml('<blockquote>quote</blockquote>')).toBe('<blockquote>quote</blockquote>');
        expect(sanitizeHtml('<h1>h1</h1>')).toBe('<h1>h1</h1>');
        expect(sanitizeHtml('<h2>h2</h2>')).toBe('<h2>h2</h2>');
        expect(sanitizeHtml('<h3>h3</h3>')).toBe('<h3>h3</h3>');
    });

    it('allows safe attributes', () => {
        expect(sanitizeHtml('<a href="https://x.com" target="_blank" rel="noopener">link</a>'))
            .toBe('<a href="https://x.com" target="_blank" rel="noopener">link</a>');
        expect(sanitizeHtml('<img src="data:image/png;base64,abc" alt="test" width="100" height="50">'))
            .toBe('<img src="data:image/png;base64,abc" alt="test" width="100" height="50">');
        expect(sanitizeHtml('<span class="highlight" id="sec1">text</span>'))
            .toBe('<span class="highlight" id="sec1">text</span>');
        expect(sanitizeHtml('<span title="tooltip">text</span>'))
            .toBe('<span title="tooltip">text</span>');
    });

    it('removes script tags', () => {
        // Mock alert to prevent happy-dom from executing script content
        vi.stubGlobal('alert', vi.fn());
        try {
            const result = sanitizeHtml('<script>alert("xss")</script>safe');
            // DOMPurify removes script tags entirely (both tag and content)
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('</script>');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('removes noscript tags', () => {
        const result = sanitizeHtml('<noscript>alert("xss")</noscript>safe');
        expect(result).not.toContain('<noscript>');
    });

    it('removes event handler attributes', () => {
        expect(sanitizeHtml('<div onclick="alert(1)">click</div>'))
            .not.toContain('onclick');
        expect(sanitizeHtml('<img src="x" onerror="alert(1)">'))
            .not.toContain('onerror');
        expect(sanitizeHtml('<a href="#" onmouseover="steal()">link</a>'))
            .not.toContain('onmouseover');
    });

    it('removes style attribute (XSS prevention)', () => {
        const result = sanitizeHtml('<div style="background:url(javascript:alert(1))">test</div>');
        expect(result).not.toContain('style');
        expect(result).not.toContain('javascript');
    });

    it('removes style-based clickjacking vectors', () => {
        const result = sanitizeHtml(
            '<a style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;z-index:999" href="https://attacker.com">click</a>'
        );
        expect(result).not.toContain('style');
        expect(result).not.toContain('position:absolute');
        expect(result).not.toContain('opacity:0');
    });

    it('removes iframe tags', () => {
        expect(sanitizeHtml('<iframe src="https://evil.com"></iframe>'))
            .not.toContain('iframe');
    });

    it('removes object and embed tags', () => {
        expect(sanitizeHtml('<object data="malware.swf"></object>'))
            .not.toContain('object');
        expect(sanitizeHtml('<embed src="malware.swf">'))
            .not.toContain('embed');
    });

    it('removes base tags (redirect vector)', () => {
        expect(sanitizeHtml('<base href="https://evil.com">'))
            .not.toContain('base');
    });

    it('preserves allowed table structure', () => {
        const html = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>';
        expect(sanitizeHtml(html)).toBe(html);
    });

    it('preserves list structure', () => {
        const html = '<ol><li>First</li><li>Second</li></ol>';
        expect(sanitizeHtml(html)).toBe(html);
    });

    it('preserves definition lists', () => {
        const html = '<dl><dt>Term</dt><dd>Definition</dd></dl>';
        expect(sanitizeHtml(html)).toBe(html);
    });

    it('preserves superscript and subscript', () => {
        expect(sanitizeHtml('H<sub>2</sub>O')).toBe('H<sub>2</sub>O');
        expect(sanitizeHtml('x<sup>2</sup>')).toBe('x<sup>2</sup>');
    });

    it('handles nested tags', () => {
        expect(sanitizeHtml('<p><b>Bold</b> and <i>italic</i></p>'))
            .toBe('<p><b>Bold</b> and <i>italic</i></p>');
    });

    it('strips disallowed tags but keeps content', () => {
        const result = sanitizeHtml('<style>bad</style>good');
        // DOMPurify strips style tag, text after is kept
        expect(result).toContain('good');
        expect(result).not.toContain('<style>');
    });

    it('handles hr and div tags', () => {
        expect(sanitizeHtml('<hr>')).toBe('<hr>');
        expect(sanitizeHtml('<div>content</div>')).toBe('<div>content</div>');
    });
});
