// @ts-check
/**
 * Markdown to safe HTML, shared by the markdown viewer and the release-notes dialog.
 * Raw HTML in the source is escaped by markdown-it, then the result goes through
 * sanitizeHtml, so a text from outside (release notes) cannot inject script.
 */
import MarkdownIt from 'markdown-it';
import { sanitizeHtml, escapeHtml, isWebUrl } from '@/libs/sanitize';
import pathutils from '@/libs/ddb/pathutils';

const withImages = new MarkdownIt();

// The address of an image or a link, through the resolveUrl of the render (env): null leaves
// the image as its description and the link as its text
const defaultImage = withImages.renderer.rules.image;
withImages.renderer.rules.image = (tokens, idx, options, env, self) => {
    if (!resolveAttr(tokens[idx], 'src', env)) return escapeHtml(tokens[idx].content);
    return defaultImage ? defaultImage(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};
withImages.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    resolveAttr(tokens[idx], 'href', env);
    return self.renderToken(tokens, idx, options);
};

/** Rewrites the attribute with env.resolveUrl; false when the address is refused (and removed). */
function resolveAttr(token, name, env) {
    const resolveUrl = env && env.resolveUrl;
    const url = token.attrGet(name);
    if (!resolveUrl || url == null) return true;
    const resolved = resolveUrl(url);
    if (resolved == null) {
        const i = token.attrIndex(name);
        if (i >= 0) token.attrs.splice(i, 1);
        return false;
    }
    token.attrSet(name, resolved);
    return true;
}

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
 * @param {{ allowImages?: boolean, resolveUrl?: (url: string) => string | null }} [options]
 *   allowImages: false (a text from outside) renders an image as its alt text, and only http(s)
 *   links, opened in a new tab. resolveUrl: the address an image or a link of the text loads
 *   (null for none), see datasetFileUrls
 * @returns {string} sanitised HTML ('' for no text)
 */
export function renderMarkdown(text, { allowImages = true, resolveUrl } = {}) {
    if (!text) return '';
    return sanitizeHtml((allowImages ? withImages : withoutImages).render(text, { resolveUrl }));
}

// An address with a scheme (https:, mailto:, data:), from the root of the site (/...) or of a
// host (//host), or a place in the page (#...): not a file next to the Markdown file
const NOT_RELATIVE = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i;

/**
 * The resolveUrl of a Markdown file of a dataset: a relative address (`![](langley.png)`,
 * `[report](odm_report/report.pdf)`) names a file of the dataset from the folder of the Markdown
 * file, as on a code host, and loads it from the dataset; one that leaves the dataset is dropped.
 * Other addresses are kept.
 * @param {{ downloadUrl: (path: string, options?: { inline?: boolean }) => string }} dataset
 * @param {string} markdownPath the path of the Markdown file in the dataset
 * @returns {(url: string) => string | null}
 */
export function datasetFileUrls(dataset, markdownPath) {
    const folder = pathutils.getParentFolder(markdownPath) || '';
    return url => {
        if (NOT_RELATIVE.test(url)) return url;
        const [, pathPart, fragment = ''] = /^([^?#]*)(?:\?[^#]*)?(#.*)?$/.exec(url) || [];
        if (!pathPart) return url;
        let relative;
        try {
            // markdown-it percent-encodes the address; the dataset path is the plain text
            relative = decodeURIComponent(pathPart);
        } catch {
            return null;
        }
        const path = pathutils.resolveRelative(folder, relative);
        return path ? dataset.downloadUrl(path, { inline: true }) + fragment : null;
    };
}
