// @ts-check
/**
 * Markdown to safe HTML, shared by the markdown viewer and the release-notes dialog.
 * Raw HTML in the source is escaped by markdown-it, then the result goes through
 * sanitizeHtml, so a text from outside (release notes) cannot inject script.
 */
import MarkdownIt from 'markdown-it';
import { sanitizeHtml, escapeHtml, isWebUrl } from '@/libs/sanitize';

const withImages = new MarkdownIt();

// For a text from outside (release notes). An image would load from a host the Hub does not
// control (and tell it who reads the text): show its description instead
const withoutImages = new MarkdownIt();
withoutImages.renderer.rules.image = (tokens, idx) => escapeHtml(tokens[idx].content);

// Its links go to web pages only (no mailto:, no address relative to the Hub), in a new tab
// that cannot reach back to the Hub nor learn which page linked to it
withoutImages.validateLink = isWebUrl;
withoutImages.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, idx, options);
};

/**
 * @param {string|null|undefined} text Markdown source
 * @param {{ allowImages?: boolean }} [options] allowImages: false (a text from outside) renders an
 *   image as its alt text, and only http(s) links, opened in a new tab
 * @returns {string} sanitised HTML ('' for no text)
 */
export function renderMarkdown(text, { allowImages = true } = {}) {
    if (!text) return '';
    return sanitizeHtml((allowImages ? withImages : withoutImages).render(text));
}
