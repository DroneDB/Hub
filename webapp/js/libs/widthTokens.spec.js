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
        '--ddb-dialog-log-max': '80rem',
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

describe('FR-ORG-24: the organization and dataset lists take the whole width', () => {
    it.each(['OrganizationsPage', 'DatasetsPage'])('%s takes the whole width in its list and its map view', file => {
        const id = file === 'OrganizationsPage' ? 'organizations' : 'datasets';
        const dir = file === 'OrganizationsPage' ? 'organizations' : 'datasets';
        const template = templateOf(`js/features/${dir}/${file}.vue`);
        expect(template).toMatch(new RegExp(`<div id="${id}"(?: ref="page")?>`));
        expect(template).not.toContain('page-column');
        const style = styleOf(`js/features/${dir}/${file}.vue`);
        // the space around the page is a padding, inside its height of 100%
        expect(blockAt(style, style.indexOf(`#${id} {`))).toMatch(/^\s*(\/\*[^*]*\*\/\s*)?padding: 0\.75rem;\s*box-sizing: border-box;/);
        expect(blockAt(style, style.indexOf(`#${id} {`))).not.toMatch(/margin: 0\.75rem/);
    });

    it('the organization table fits every column to its content but the name, which takes the rest of the width', () => {
        const template = templateOf('js/features/organizations/OrganizationsPage.vue');
        const columns = template.match(/<Column\b[^>]*>/g);
        expect(columns.length).toBeGreaterThan(1);
        const [name, ...others] = columns;
        expect(name).toContain('field="name"');
        expect(name).not.toContain('col-fit');
        for (const column of others) expect(column).toContain('class="col-fit"');
    });

    it('the dataset table gives the dates 11rem, Files and Size 6rem without wrapping, Visibility 8rem; Dataset takes the rest', () => {
        const template = templateOf('js/features/datasets/DatasetsPage.vue');
        expect(template.match(/class="ds-col-date"/g)).toHaveLength(2);
        expect(template.match(/class="ds-col-count"/g)).toHaveLength(2);
        expect(template.match(/class="ds-col-visibility"/g)).toHaveLength(1);
        const style = styleOf('js/features/datasets/DatasetsPage.vue');
        expect(style).toContain('.ds-table :deep(.ds-col-date) { width: 11rem; }');
        // "906,06 MB" does not break between the number and its unit
        expect(style).toContain('.ds-table :deep(.ds-col-count) { width: 6rem; white-space: nowrap; }');
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

describe('FR-ADM-27: the widths of the admin tables', () => {
    it('/admin/users takes the whole width, with the side padding of the routed pages', () => {
        const template = templateOf('js/features/admin/UsersPage.vue');
        expect(template).toContain('class="page-scroll"');
        expect(template).not.toMatch(/page-scroll-column|page-column/);
        const style = styleOf('js/features/admin/UsersPage.vue');
        const rule = blockAt(style, style.indexOf('#users {'));
        expect(rule).toMatch(/padding-block: /);
        expect(rule).toContain('padding-inline: var(--ddb-page-padding-x);');
        expect(rule).not.toMatch(/max-width/);
    });

    it('/admin/tasks takes the whole width, with the side padding of the routed pages', () => {
        const template = templateOf('js/features/admin/TasksPage.vue');
        expect(template).toContain('class="admin-tasks-page page-scroll"');
        expect(template).not.toMatch(/page-scroll-column|page-column/);
        const style = styleOf('js/features/admin/TasksPage.vue');
        const rule = blockAt(style, style.indexOf('.admin-tasks-page {'));
        expect(rule).toContain('padding-inline: var(--ddb-page-padding-x);');
        expect(rule).not.toMatch(/max-width/);
    });

    it('the users table gives Organizations, Datasets, Storage, Created and Actions the width of their content', () => {
        const template = templateOf('js/features/admin/UsersPage.vue');
        expect(template.match(/class="col-fit"/g)).toHaveLength(5);
        const style = styleOf('js/features/admin/UsersPage.vue');
        expect(blockAt(style, style.indexOf('.search-col {'))).toContain('max-width: 28rem;');
        expect(style).toMatch(/\.p-progressbar\) \{\s*max-width: 20rem;/);
    });
});

describe('FR-EXP-42: the Files and Tasks tables keep their columns near the name', () => {
    it('.col-fit gives a column the width of its content, on one line, in a table and not in a phone card', () => {
        const media = blockAt(scss, scss.indexOf('@media only screen and (min-width: 576px) {\n    .col-fit {'));
        expect(media).toMatch(/\.col-fit \{\s*width: 1%;\s*white-space: nowrap;\s*\}/);
    });

    it('every task column but Tool and Progress fits its content, Progress has the width of a bar and Tool the rest', () => {
        const file = 'js/features/tasks/TasksTable.vue';
        const style = styleOf(file);
        const template = templateOf(file);
        const columns = template.slice(template.indexOf('<!-- Task table -->')).match(/<Column [^>]*>/g);
        expect(columns).toHaveLength(8);
        for (const column of columns) {
            if (column.includes('header="Progress"')) expect(column).toContain('class="col-progress"');
            else if (column.includes('header="Tool"')) expect(column).toContain('class="col-tool"');
            else expect(column).toMatch(/class="col-fit[ "]/);
            expect(column).not.toMatch(/style="width/);
        }
        expect(blockAt(style, style.indexOf('.tasks-table :deep(.p-datatable-table) {'))).toContain('table-layout: auto;');
        // Progress: a share of the room, between 5rem and 20rem, whatever its content
        expect(style).toContain('--tasks-text-room: calc(100cqi - var(--tasks-other-width));');
        expect(style).toContain('--tasks-progress-width: clamp(5rem, 5rem + var(--tasks-text-room) * 0.3, 20rem);');
        expect(style).toMatch(/\.tasks-table :deep\(\.col-progress\) \{\s*width: var\(--tasks-progress-width\);/);
        expect(style).toMatch(/td\.col-progress > \*\) \{\s*contain: inline-size;/);
        // Tool: the rest of the width, its text on one line and cut, never narrower than a few words
        expect(style).toMatch(/td\.col-tool > \.tool-cell\) \{\s*contain: inline-size;\s*min-width: 6rem;\s*white-space: nowrap;/);
        expect(style).toMatch(/\.owner-cell \{\s*max-width: var\(--tasks-name-max\);/);
        // the table takes the whole width of its page (the dataset's task history)
        expect(template).toContain('<div class="tasks-table"');
        expect(blockAt(style, style.indexOf('.tasks-table {'))).toContain('width: 100%;');
    });

    it('the buttons of a task row stay on one line', () => {
        const file = 'js/features/tasks/TasksTable.vue';
        expect(templateOf(file)).toContain('<div class="task-actions">');
        expect(blockAt(styleOf(file), styleOf(file).indexOf('.task-actions {'))).toContain('flex-wrap: nowrap;');
    });

    it('the files table takes the whole width at every screen width', () => {
        const style = styleOf('js/features/dataset/explorer/TableView.vue');
        expect(style).not.toMatch(/xwide-up|wide-up/);
        expect(style).not.toMatch(/\.p-datatable-table\) \{\s*width: auto;/);
    });

    it('a type name, a size and a date stay on one line', () => {
        expect(styleOf('js/features/dataset/explorer/TableView.vue')).toMatch(/\.file-type, \.file-size, \.file-date \{\s*white-space: nowrap;/);
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
