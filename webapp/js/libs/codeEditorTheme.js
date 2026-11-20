// @ts-check
/**
 * The colours of the CodeMirror text editor (TextEditorDialog) as the Hub's colour tokens
 * (--ddb-code-*, --ddb-text and the others of css/_variables.scss), so it reads in the light and
 * the dark theme and follows a change of scheme while it is open (FR-XC-21).
 *
 * The syntax colours are CodeMirror's default highlight style with each of its colours replaced
 * by a token: the same tags, the same weights and decorations.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, defaultHighlightStyle } from '@codemirror/language';

/** CodeMirror's default syntax colour -> the token that replaces it. */
export const CODE_COLOR_TOKENS = Object.freeze({
    '#404740': 'var(--ddb-code-meta)',
    '#708': 'var(--ddb-code-keyword)',
    '#219': 'var(--ddb-code-atom)',
    '#164': 'var(--ddb-code-literal)',
    '#a11': 'var(--ddb-code-string)',
    '#e40': 'var(--ddb-code-escape)',
    '#00f': 'var(--ddb-code-property)',
    '#00c': 'var(--ddb-code-property)',
    '#30a': 'var(--ddb-code-variable)',
    '#256': 'var(--ddb-code-variable)',
    '#085': 'var(--ddb-code-type)',
    '#167': 'var(--ddb-code-type)',
    '#940': 'var(--ddb-code-comment)',
    '#f00': 'var(--ddb-danger)'
});

/** The default highlight style with the token colours (a colour it does not know: the text's). */
export const codeHighlightStyle = HighlightStyle.define(defaultHighlightStyle.specs.map(spec => (spec.color
    ? { ...spec, color: CODE_COLOR_TOKENS[spec.color] ?? 'inherit' }
    : spec)));

const SELECTION = { backgroundColor: 'var(--ddb-code-selection)' };
const ACTIVE_LINE = { backgroundColor: 'var(--ddb-code-active-line)' };

/** The text, the gutter, the selection and the active line of the editor, as tokens. */
export const codeEditorTheme = EditorView.theme({
    '&': { color: 'var(--ddb-text)', backgroundColor: 'transparent' },
    '.cm-gutters': { color: 'var(--ddb-text-muted)' },
    '.cm-activeLine': ACTIVE_LINE,
    '.cm-activeLineGutter': ACTIVE_LINE,
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': SELECTION,
    '.cm-selectionBackground': SELECTION,
    '.cm-content ::selection': SELECTION,
    '&.cm-focused .cm-matchingBracket': SELECTION
});
