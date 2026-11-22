// @ts-check
/**
 * Markdown as PDF content. The text is the user's (notes, the disclaimer of a template, the description of an item):
 * it is parsed to tokens and each is mapped to a node of the PDF, so no HTML is ever made, and raw HTML in the source is
 * text, as it is on the page (markdown-it escapes it). Links are drawn only for web addresses, an image is its
 * description, as on the page. The text stays text: it can be selected and searched.
 */
import MarkdownIt from 'markdown-it';
import { isWebUrl } from '@/libs/sanitize';

const markdown = new MarkdownIt();
markdown.validateLink = isWebUrl;

const GREY = '#475569';
const CODE_BACKGROUND = '#f1f5f9';

/**
 * @typedef {object} MarkdownStyle
 * @property {string} [link]  the colour of a link
 */

/**
 * The runs of an inline token list: text with the style of its emphasis, code and link around it.
 * @param {any[]} tokens @param {MarkdownStyle} style
 * @returns {any[]}
 */
function inlineRuns(tokens, style) {
    /** @type {any[]} */
    const runs = [];
    const state = { bold: 0, italics: 0, strike: 0, link: /** @type {string[]} */ ([]) };
    const push = (/** @type {string} */ text, extra = {}) => {
        if (!text) return;
        /** @type {Record<string, any>} */
        const run = { text, ...extra };
        if (state.bold) run.bold = true;
        if (state.italics) run.italics = true;
        if (state.strike) run.decoration = 'lineThrough';
        const href = state.link[state.link.length - 1];
        if (href) Object.assign(run, { link: href, color: style.link ?? '#1d4ed8', decoration: 'underline' });
        runs.push(run);
    };
    for (const token of tokens) {
        switch (token.type) {
            case 'text': push(token.content); break;
            case 'softbreak': push(' '); break;
            case 'hardbreak': push('\n'); break;
            case 'code_inline': push(token.content, { background: CODE_BACKGROUND, fontSize: 9 }); break;
            case 'image': push(token.content); break;
            case 'strong_open': state.bold++; break;
            case 'strong_close': state.bold--; break;
            case 'em_open': state.italics++; break;
            case 'em_close': state.italics--; break;
            case 's_open': state.strike++; break;
            case 's_close': state.strike--; break;
            case 'link_open': state.link.push(token.attrGet('href') ?? ''); break;
            case 'link_close': state.link.pop(); break;
            default: push(token.content ?? '');
        }
    }
    return runs;
}

/** The index of the token that closes the one at `start` (same nesting). @param {any[]} tokens @param {number} start */
function closeOf(tokens, start) {
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
        depth += tokens[i].nesting;
        if (depth === 0) return i;
    }
    return tokens.length - 1;
}

const HEADING_SIZE = Object.freeze({ h1: 15, h2: 13, h3: 11.5, h4: 10.5, h5: 10, h6: 10 });

/**
 * @param {any[]} tokens @param {MarkdownStyle} style
 * @returns {any[]}
 */
function blocks(tokens, style) {
    /** @type {any[]} */
    const nodes = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const end = token.nesting === 1 ? closeOf(tokens, i) : i;
        const inner = tokens.slice(i + 1, end);
        switch (token.type) {
            case 'paragraph_open':
                nodes.push({ text: inlineRuns(inner[0]?.children ?? [], style), margin: [0, 0, 0, 5] });
                break;
            case 'heading_open':
                nodes.push({ text: inlineRuns(inner[0]?.children ?? [], style), bold: true, fontSize: /** @type {Record<string, number>} */ (HEADING_SIZE)[token.tag] ?? 10, margin: [0, 4, 0, 4] });
                break;
            case 'bullet_list_open':
            case 'ordered_list_open': {
                const items = [];
                for (let j = 0; j < inner.length; j++) {
                    if (inner[j].type !== 'list_item_open') continue;
                    const itemEnd = closeOf(inner, j);
                    const content = blocks(inner.slice(j + 1, itemEnd), style);
                    items.push(content.length === 1 ? content[0] : { stack: content });
                    j = itemEnd;
                }
                nodes.push(token.type === 'bullet_list_open' ? { ul: items, margin: [0, 0, 0, 5] } : { ol: items, start: Number(token.attrGet('start') ?? 1), margin: [0, 0, 0, 5] });
                break;
            }
            case 'blockquote_open':
                nodes.push({ stack: blocks(inner, style), color: GREY, margin: [12, 0, 0, 5] });
                break;
            case 'fence':
            case 'code_block':
                nodes.push({ text: token.content.replace(/\n$/, ''), fontSize: 8.5, background: CODE_BACKGROUND, preserveLeadingSpaces: true, margin: [0, 0, 0, 5] });
                break;
            case 'hr':
                nodes.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }], margin: [0, 4, 0, 6] });
                break;
            case 'table_open': {
                const rows = [];
                for (let j = 0; j < inner.length; j++) {
                    if (inner[j].type !== 'tr_open') continue;
                    const rowEnd = closeOf(inner, j);
                    const cells = inner.slice(j + 1, rowEnd).filter(t => t.type === 'th_open' || t.type === 'td_open')
                        .map(cell => ({ text: inlineRuns(inner[inner.indexOf(cell) + 1]?.children ?? [], style), bold: cell.type === 'th_open' || undefined, fontSize: 9 }));
                    rows.push(cells);
                    j = rowEnd;
                }
                if (rows.length) nodes.push({ table: { headerRows: 1, widths: rows[0].map(() => 'auto'), body: rows }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 6] });
                break;
            }
            default:
        }
        i = end;
    }
    return nodes;
}

/**
 * Markdown as PDF content nodes.
 * @param {string | null | undefined} text
 * @param {MarkdownStyle} [style]
 * @returns {any[]}
 */
export function markdownToPdf(text, style = {}) {
    if (!text || !text.trim()) return [];
    return blocks(markdown.parse(text, {}), style);
}
