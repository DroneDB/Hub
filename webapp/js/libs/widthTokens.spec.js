/**
 * The maximum widths of a wide screen (FR-XC-33, U-503): the width tokens, the breakpoints and the classes that
 * give a page its column, read from css/_variables.scss, css/_breakpoints.scss and css/app.scss; and what each page
 * of FR-ORG-24, FR-EXP-39, FR-ADM-27, FR-ADM-28, FR-NAV-10, FR-EXP-42, FR-ACC-23, FR-UPL-22 and FR-ORG-26 takes
 * from them (a class, a token, a breakpoint mixin) and no longer sets itself. A browser measures the result (the
 * Playwright pass of AC-038); the expected values here are the SPEC's, written out.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BREAKPOINT_PX } from './responsiveColumns';

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const variables = read('css/_variables.scss');
const breakpoints = read('css/_breakpoints.scss');
const scss = read('css/app.scss');

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
/** The <style> block of a component */
const styleOf = file => read(file).split(/<style[^>]*>/)[1];
const templateOf = file => read(file).split('<script')[0];

describe('the width tokens (FR-XC-33)', () => {
    const tokens = {
        '--ddb-prose-max': '72ch',
        '--ddb-editor-max': '100ch',
        '--ddb-form-max': '960px',
        '--ddb-page-max-width': '100rem',
        '--ddb-panel-tree-width': 'clamp(15rem, 18vw, 22.5rem)',
        '--ddb-panel-detail-width': 'clamp(20rem, 22vw, 45rem)',
        '--ddb-panel-analysis-width': 'clamp(16rem, 18vw, 28rem)',
        '--ddb-popup-width': 'clamp(20rem, 22vw, 40rem)',
        '--ddb-dialog-form-max': '47rem',
        '--ddb-dialog-wide-max': '120rem'
    };

    it.each(Object.entries(tokens))('%s is %s, once, in :root', (name, value) => {
        const found = variables.match(new RegExp(`${name}: ([^;]+);`, 'g'));
        expect(found).toHaveLength(1);
        expect(found[0]).toBe(`${name}: ${value};`);
        // not in the dark theme block: a width is not a colour
        expect(variables.slice(variables.lastIndexOf(':root.app-dark'))).not.toContain(name);
    });
});

describe('the breakpoints of the wide screens', () => {
    it('are the widths of responsiveColumns.js', () => {
        expect(breakpoints).toContain(`$wide: ${BREAKPOINT_PX.wide}px;`);
        expect(breakpoints).toContain(`$xwide: ${BREAKPOINT_PX.xwide}px;`);
        expect(breakpoints).toContain(`$wide: 1600px;`);
        expect(breakpoints).toContain(`$xwide: 2560px;`);
        expect(breakpoints).toMatch(/@mixin wide-up \{\s*@media only screen and \(min-width: \$wide\)/);
        expect(breakpoints).toMatch(/@mixin xwide-up \{\s*@media only screen and \(min-width: \$xwide\)/);
    });

    it('are used by app.scss from the partial, not repeated as numbers', () => {
        expect(scss).toContain("@use 'breakpoints' as *;");
        const column = scss.slice(scss.indexOf('.d-none.d-#{$name}-table-cell') - 200);
        expect(column).toContain('@each $name, $px in (wide: $wide, xwide: $xwide)');
        expect(column).toContain('.d-none.d-#{$name}-table-cell { display: table-cell !important; }');
    });
});

describe('the column classes of app.scss', () => {
    it('give a centred column the width of their token', () => {
        const mixin = blockAt(scss, scss.indexOf('@mixin width-column'));
        expect(mixin).toContain('width: 100%;');
        expect(mixin).toContain('max-width: $max;');
        expect(mixin).toContain('margin-inline: auto;');
        expect(mixin).toContain('box-sizing: border-box;');
        expect(scss).toContain('.page-column   { @include width-column(var(--ddb-page-max-width)); }');
        expect(scss).toContain('.form-column   { @include width-column(var(--ddb-form-max)); }');
        expect(scss).toContain('.prose-column  { @include width-column(var(--ddb-prose-max)); }');
        expect(scss).toContain('.editor-column { @include width-column(var(--ddb-editor-max)); }');
    });

    it('centre the content of a page that scrolls itself by its side padding, so the scroll bar stays at the screen edge', () => {
        const rule = blockAt(scss, scss.indexOf('.page-scroll-column {'));
        expect(rule).toContain('padding-inline: max(var(--page-column-pad, var(--ddb-page-padding-x)), calc((100% - var(--ddb-page-max-width)) / 2));');
    });
});

describe('FR-ORG-24: the organization and dataset lists keep one column', () => {
    it.each(['OrganizationsPage', 'DatasetsPage'])('%s is a page column in its list view, and not in its map view', file => {
        const id = file === 'OrganizationsPage' ? 'organizations' : 'datasets';
        const dir = file === 'OrganizationsPage' ? 'organizations' : 'datasets';
        const template = templateOf(`js/features/${dir}/${file}.vue`);
        expect(template).toMatch(new RegExp(`<div id="${id}"(?: ref="page")? :class="\\{ 'page-column': view !== 'map' \\}">`));
        const style = styleOf(`js/features/${dir}/${file}.vue`);
        // the space around the page is a padding: a margin would outrank the centring of the class
        expect(blockAt(style, style.indexOf(`#${id} {`))).toMatch(/^\s*(\/\*[^*]*\*\/\s*)?padding: 0\.75rem;\s*box-sizing: border-box;/);
        expect(blockAt(style, style.indexOf(`#${id} {`))).not.toMatch(/margin: 0\.75rem/);
    });

    it('the organization cards are 2 columns from xwide (40rem minimum)', () => {
        const style = styleOf('js/features/organizations/OrganizationsPage.vue');
        expect(style).toContain("@use '../../../css/breakpoints' as *;");
        const grid = blockAt(style, style.indexOf('@include xwide-up'));
        expect(grid).toContain('display: grid;');
        expect(grid).toContain('grid-template-columns: repeat(auto-fill, minmax(40rem, 1fr));');
        // the empty state spans the row
        expect(grid).toMatch(/> :not\(\.org-card\) \{\s*grid-column: 1 \/ -1;/);
    });

    it('the dataset table gives the dates 11rem, Files and Size 6rem, Visibility 8rem; Dataset takes the rest', () => {
        const template = templateOf('js/features/datasets/DatasetsPage.vue');
        expect(template.match(/class="ds-col-date"/g)).toHaveLength(2);
        expect(template.match(/class="ds-col-count"/g)).toHaveLength(2);
        expect(template.match(/class="ds-col-visibility"/g)).toHaveLength(1);
        const style = styleOf('js/features/datasets/DatasetsPage.vue');
        expect(style).toContain('.ds-table :deep(.ds-col-date) { width: 11rem; }');
        expect(style).toContain('.ds-table :deep(.ds-col-count) { width: 6rem; }');
        expect(style).toContain('.ds-table :deep(.ds-col-visibility) { width: 8rem; }');
    });
});

describe('FR-EXP-39: the Markdown text and editor are centred columns', () => {
    it('has no float or absolute position for Edit, and no width value of its own', () => {
        const style = styleOf('js/features/viewers/markdown/MarkdownViewer.vue');
        expect(style).not.toMatch(/float:/);
        expect(blockAt(style, style.indexOf('.view-toolbar {'))).toMatch(/position: sticky;\s*top: 0;/);
        expect(style).not.toMatch(/max-width: \d+(rem|px|ch)/);
    });
});

describe('FR-ADM-27: the admin tables keep one column', () => {
    it('/admin/users and /admin/tasks are page-scroll-column, with no side padding of their own', () => {
        for (const [file, id] of [['UsersPage', '#users'], ['TasksPage', '.admin-tasks-page']]) {
            expect(templateOf(`js/features/admin/${file}.vue`)).toMatch(/page-scroll page-scroll-column/);
            const style = styleOf(`js/features/admin/${file}.vue`);
            expect(blockAt(style, style.indexOf(`${id} {`))).toMatch(/padding-block: /);
            expect(blockAt(style, style.indexOf(`${id} {`))).not.toMatch(/padding: /);
        }
    });

    it('the users table gives Organizations, Datasets, Storage, Created and Actions the width of their content', () => {
        const template = templateOf('js/features/admin/UsersPage.vue');
        expect(template.match(/class="users-col-fit"/g)).toHaveLength(5);
        const style = styleOf('js/features/admin/UsersPage.vue');
        expect(style).toMatch(/\.users-col-fit\) \{\s*width: 1%;\s*white-space: nowrap;/);
        expect(blockAt(style, style.indexOf('.search-col {'))).toContain('max-width: 28rem;');
        expect(style).toMatch(/\.p-progressbar\) \{\s*max-width: 20rem;/);
    });
});

describe('FR-EXP-42: the Files and Tasks tables keep their columns near the name', () => {
    it('the task table has Progress 16rem (the bar at most 20rem), Created 11rem, Dataset and Owner 14rem from xwide', () => {
        const file = 'js/features/tasks/TasksTable.vue';
        const style = styleOf(file);
        const wide = blockAt(style, style.indexOf('@include xwide-up'));
        expect(wide).toContain('.tasks-table :deep(.col-progress) { width: 16rem; }');
        expect(wide).toContain('.tasks-table :deep(.col-created) { width: 11rem; }');
        expect(wide).toMatch(/\.col-dataset\),\s*\.tasks-table :deep\(\.col-owner\) \{ width: 14rem; \}/);
        expect(blockAt(style, style.indexOf('.task-progress {'))).toContain('max-width: 20rem;');
        const template = templateOf(file);
        for (const cls of ['col-progress', 'col-created', 'col-dataset', 'col-owner']) expect(template).toContain(`class="${cls}"`);
        // the table itself is one column of the list width
        expect(template).toContain('<div class="tasks-table page-column">');
    });

    it('the files table has the width of its content from xwide, its Name column at most 40rem', () => {
        const style = styleOf('js/features/dataset/explorer/TableView.vue');
        const wide = blockAt(style, style.indexOf('@include xwide-up'));
        expect(wide).toMatch(/\.p-datatable-table\) \{\s*width: auto;/);
        expect(wide).toMatch(/\.file-name\) \{\s*display: block;\s*max-width: 40rem;/);
    });
});

describe('FR-ADM-28: the configuration page has one centred column of two cards', () => {
    const file = 'js/features/admin/AdminConfig.vue';

    it('the scroll container is a page column, and the cards share one grid row', () => {
        expect(templateOf(file)).toContain('class="config-scroll-container page-scroll-column"');
        const style = styleOf(file);
        expect(blockAt(style, style.indexOf('.config-cards {'))).toContain('grid-template-columns: repeat(auto-fit, minmax(30rem, 1fr));');
        expect(templateOf(file)).toMatch(/<div class="config-cards">\s*<UsageAndContactCard ref="usageCard" \/>\s*<EmailTemplatesCard ref="emailTemplatesCard" \/>\s*<\/div>/);
    });

    it('the fields grid has at most 3 columns, and the cards have no 48rem limit of their own', () => {
        const style = styleOf(file);
        expect(blockAt(style, style.indexOf('.config-fields-grid {'))).toContain('minmax(max(min(380px, 100%), calc((100% - 2 * 1.5rem) / 3)), 1fr)');
        for (const card of ['UsageAndContactCard', 'EmailTemplatesCard']) {
            expect(styleOf(`js/features/admin/${card}.vue`)).not.toContain('48rem');
            expect(styleOf(`js/features/admin/${card}.vue`)).toContain('max-width: var(--ddb-form-max);');
        }
    });
});

describe('FR-NAV-10: the Login and Upload pages use the height of the screen', () => {
    it('the login card starts at clamp(2rem, 18vh, 20rem) from the top', () => {
        const style = styleOf('js/features/account/LoginPage.vue');
        expect(blockAt(style, style.indexOf('#login {'))).toMatch(/min-height: 100%;\s*padding-top: clamp\(2rem, 18vh, 20rem\);/);
    });

    it('the upload form is a form column and its drop zone is at least half the height, dashed', () => {
        expect(templateOf('js/features/upload/UploadPage.vue')).toContain('class="upload-form form-column"');
        const style = styleOf('js/features/upload/UploadPage.vue');
        const zone = blockAt(style, style.indexOf('.droparea {'));
        expect(zone).toContain('min-height: 50vh;');
        expect(zone).toContain('border: 2px dashed var(--ddb-border-medium);');
        expect(blockAt(style, style.indexOf('.upload-form {'))).not.toContain('max-width');
    });
});

describe('FR-ACC-23 and FR-UPL-22: a dialog takes its width from its size class', () => {
    it('Preferences is dialog-xl and its tabs take the width of the window, so the 7 labels fit', () => {
        const file = 'js/features/account/PreferencesDialog.vue';
        expect(templateOf(file)).toContain('size-class="dialog-xl"');
        const style = styleOf(file);
        expect(blockAt(style, style.indexOf('.pref-tabs {'))).toMatch(/^\s*width: 100%;\s*$/);
        expect(style).not.toContain('34rem');
    });

    it('Import is dialog-xl with no width or max-width of its own', () => {
        const file = 'js/features/datasets/ImportDatasetDialog.vue';
        expect(templateOf(file)).toContain('size-class="dialog-xl"');
        expect(templateOf(file)).not.toMatch(/max-width=|width="/);
        expect(styleOf(file)).not.toMatch(/(max-)?width: (70%|\d+(rem|px))/);
    });
});
