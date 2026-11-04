import DOMPurify from 'dompurify';

/**
 * Sanitize HTML to prevent XSS.
 * Allows safe tags only (no scripts, event handlers, etc.)
 */
export function sanitizeHtml(dirty) {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
                       'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote',
                       'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div',
                       'hr', 'dl', 'dt', 'dd', 'sup', 'sub'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id',
                       'width', 'height'],
    });
}

/**
 * Escape text for interpolation into an HTML string (element content or a quoted attribute).
 */
export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * True for an absolute http(s) address, the only kind a page may link to when the address
 * comes from outside (a javascript: or data: URL is refused).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isWebUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const { protocol } = new URL(value);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
}
