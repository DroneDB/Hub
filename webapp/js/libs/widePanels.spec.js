/**
 * Side panels, analysis panels and tool windows on a wide screen (FR-EXP-40, FR-RAS-35, FR-PRC-44, FR-PRC-45; U-504):
 * what each component takes from the width tokens of FR-XC-33 (css/_variables.scss), read from its source. A browser
 * measures the result (e2e/wide-panels.test.mjs); the expected values here are the SPEC's, written out.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compileStyle } from '@vue/compiler-sfc';

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
/** The text of the block that starts at `start` (up to its matching brace) */
function blockAt(text, start) {
    const open = text.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
    }
    throw new Error('unbalanced');
}
const styleOf = file => read(file).split(/<style[^>]*>/)[1];
const templateOf = file => read(file).split('<script')[0];
const rule = (text, selector) => {
    const at = text.indexOf(`${selector} {`);
    expect(at, `${selector} is in the stylesheet`).toBeGreaterThanOrEqual(0);
    return blockAt(text, at);
};

describe('FR-EXP-40: the tree and the detail panel have the width of their token', () => {
    const page = read('js/features/dataset/ViewDataset.vue');

    it('the tree is the first pane with --ddb-panel-tree-width, kept in px', () => {
        expect(page).toMatch(/<Panel v-else split="vertical" class="main" amount="23\.6%" first-size="var\(--ddb-panel-tree-width\)"/);
    });

    it('.detail-side is --ddb-panel-detail-width wide, with no maximum of 25rem and no share of the row', () => {
        const side = rule(styleOf('js/features/dataset/ViewDataset.vue'), '.detail-side');
        expect(side).toContain('flex: 0 1 var(--ddb-panel-detail-width);');
        expect(side).toContain('min-width: 15rem;');
        expect(side).not.toContain('max-width');
        expect(side).not.toContain('25rem');
        expect(side).not.toMatch(/flex: 3;/);
        expect(page).not.toMatch(/\.detail-main\.with-detail \{\s*flex: 7;/);
    });
});

describe('FR-RAS-35: the analysis panels, the profile chart and the split labels', () => {
    const scss = read('css/_analysis-panel.scss');

    it('the panel is --ddb-panel-analysis-width wide and its text 0.875rem', () => {
        const panel = rule(scss, '.analysis-panel');
        expect(panel).toContain('width: var(--ddb-panel-analysis-width);');
        expect(panel).not.toMatch(/width: 16rem;/);
        expect(panel).toContain('font-size: 0.875rem;');
    });

    it('the fields and buttons of the panel are 0.875rem too', () => {
        expect(blockAt(scss, scss.indexOf('.panel-select,\n    .panel-input,\n    .panel-range {'))).toContain('font-size: 0.875rem;');
        expect(rule(scss, '.panel-btn')).toContain('font-size: 0.875rem;');
    });

    it('the axis text of the chart is 0.75rem (12px) and the paddings leave room for it', () => {
        const style = styleOf('js/features/viewers/map/RasterProfileChart.vue');
        expect(rule(style, '.profile-svg .label')).toContain('font-size: 0.75rem;');
        // The left padding is that of the longest y label, 6.5 px a character at that font (FR-RAS-08)
        expect(read('js/features/viewers/map/RasterProfileChart.vue')).toMatch(/padTop: 12,\s*padBottom: 20,\s*padRight: 8,/);
        expect(read('js/features/viewers/map/RasterProfileChart.vue')).toContain('const LABEL_CHAR_WIDTH = 6.5;');
    });

    it('the split labels are 0.8rem', () => {
        expect(rule(styleOf('js/features/viewers/map/RasterSplitOverlay.vue'), '.split-label-pill')).toContain('font-size: 0.8rem;');
    });
});

describe('FR-PRC-44: the task log window', () => {
    const file = 'js/features/tasks/TaskLogDialog.vue';
    const style = styleOf(file);

    it('is the wide window, which the user can maximize', () => {
        expect(templateOf(file)).toMatch(/<Window id="task-log"[^>]*size-class="dialog-wide" maximizable/);
        expect(templateOf(file)).not.toContain('width="48rem"');
    });

    it('the log is 90vh - 10rem high at most, 0.875rem, and does not wrap with Wrap lines off', () => {
        const log = rule(style, '.task-log');
        expect(log).toContain('max-height: calc(90vh - 10rem);');
        expect(log).toContain('font-size: 0.875rem;');
        expect(log).toContain('white-space: pre-wrap;');
        expect(rule(style, '.task-log.no-wrap')).toContain('white-space: pre;');
    });

    it('a maximized window gives the log the screen', () => {
        // What the browser gets: the selector the Vue compiler writes, not the source text
        const { code } = compileStyle({ source: style.split('</style>')[0], filename: 'TaskLogDialog.vue', id: 'data-v-test', scoped: true });
        // (:global keeps the whole selector out of the scoping; the rule comes after the scoped one of the same weight)
        expect(rule(code, '.p-dialog-maximized .task-log')).toContain('max-height: calc(100vh - 10rem);');
        expect(code.indexOf('.p-dialog-maximized .task-log {')).toBeGreaterThan(code.indexOf('.task-log[data-v-test] {'));
        expect(code).not.toMatch(/\.p-dialog-maximized\s*\{/);
        const scss = read('css/app.scss');
        expect(rule(scss, '.p-dialog.window-dialog.p-dialog-maximized')).toContain('max-width: none;');
    });
});

describe('FR-PRC-45: the Run Photogrammetry window', () => {
    const file = 'js/features/dataset/TaskHistory.vue';
    const style = styleOf(file);

    it('is the wide window from the wide breakpoint and the form window below it', () => {
        expect(templateOf(file)).toContain(`:size-class="wideScreen ? 'dialog-wide' : 'dialog-xl'"`);
        expect(read(file)).toContain('wideScreen: useMediaMatch(WIDE_MEDIA_QUERY)');
    });

    it('has the fields, the options and the output in three groups', () => {
        const template = templateOf(file);
        expect(template.indexOf('class="pg-fields"')).toBeLessThan(template.indexOf('class="pg-options"'));
        expect(template.indexOf('class="pg-options"')).toBeLessThan(template.indexOf('class="pg-output"'));
        expect(template.indexOf('<OdxOptionsEditor')).toBeGreaterThan(template.indexOf('class="pg-options"'));
        expect(template.indexOf('<OdxOptionsEditor')).toBeLessThan(template.indexOf('class="pg-output"'));
    });

    it('from sm it is 90vh high with a column for content: the fields do not grow, the options take the free height', () => {
        const at = style.indexOf('@media (min-width: 576px)');
        const media = blockAt(style, at);
        expect(rule(media, ':global(#photogrammetry.p-dialog.window-dialog)')).toContain('height: 90vh;');
        expect(rule(media, ':global(#photogrammetry .p-dialog-content)')).toMatch(/display: flex;\s*flex-direction: column;/);
        expect(rule(media, '.pg-fields,\n    .pg-output')).toContain('flex: none;');
        expect(rule(media, '.pg-options')).toContain('flex: 1 1 0px;');
    });

    it('from the wide breakpoint the fields and the options are side by side, 1fr 2fr', () => {
        expect(style).toContain("@use '../../../css/breakpoints' as *;");
        const wide = blockAt(style, style.indexOf('@include wide-up'));
        expect(rule(wide, '.pg-layout')).toMatch(/display: grid;\s*grid-template-columns: 1fr 2fr;/);
        expect(rule(wide, '.pg-options')).toMatch(/grid-column: 2;\s*grid-row: 1 \/ span 2;/);
    });

    it('the options list takes the free height of the editor, at least 12rem, and has no maximum height', () => {
        const editor = styleOf('js/features/dataset/OdxOptionsEditor.vue');
        const list = rule(editor, '.odm-options-content');
        expect(list).toContain('flex: 1 1 0px;');
        expect(list).toContain('min-height: 12rem;');
        expect(list).toContain('overflow-y: auto;');
        expect(list).not.toContain('max-height');
        expect(rule(editor, '.odm-options-editor')).toMatch(/display: flex;\s*flex-direction: column;/);
    });
});
