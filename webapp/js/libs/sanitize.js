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
 * Plain text as the HTML that shows it: markup characters escaped, a newline a line break. For a widget that keeps
 * its text as HTML (Potree's annotations); only `<br>` is ever made from the text.
 * @param {unknown} text
 * @returns {string}
 */
export function textToHtml(text) {
    return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

// The elements that start and end a line of their own, as a contenteditable makes them with Enter
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR']);

/**
 * The text that an HTML string shows: the reverse of textToHtml, and for the HTML a contenteditable makes from
 * what is typed (`a<div>b</div>`, `a<br>b`). The HTML is parsed by DOMParser, which runs no script and loads
 * nothing; only the text of the document is taken, `<br>` and the start and end of a block are line breaks, and
 * no tag is ever kept. A stored text that holds a literal `<br>` therefore comes back as text, not as a break.
 * @param {unknown} html
 * @returns {string}
 */
export function htmlToText(html) {
    const body = new DOMParser().parseFromString(String(html ?? ''), 'text/html').body;
    let out = '';
    // A block asks for a line break before whatever comes next, unless the text already ends with one
    let breakBefore = false;
    const emit = (/** @type {string} */ text) => {
        if (breakBefore && out && !out.endsWith('\n')) out += '\n';
        breakBefore = false;
        out += text;
    };
    const walk = (/** @type {Node} */ parent) => {
        for (const node of Array.from(parent.childNodes)) {
            if (node.nodeType === 3) {
                if (node.nodeValue) emit(node.nodeValue);
            } else if (node.nodeType === 1) {
                const tag = /** @type {Element} */ (node).tagName;
                if (tag === 'BR') {
                    emit('\n');
                } else if (tag === 'SCRIPT' || tag === 'STYLE') {
                    continue;
                } else if (BLOCK_TAGS.has(tag)) {
                    if (out) breakBefore = true;
                    walk(node);
                    breakBefore = true;
                } else {
                    walk(node);
                }
            }
        }
    };
    walk(body);
    return out;
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
