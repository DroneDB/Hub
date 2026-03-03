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
                       'width', 'height', 'style'],
    });
}
