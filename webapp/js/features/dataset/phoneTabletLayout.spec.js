/**
 * The styles of the dataset page on a tablet and a phone, read from the components (FR-EXP-17, FR-EXP-29). A browser
 * measures the result (the Playwright pass of AC-031, e2e/phone-tablet-layout.test.mjs); here the rules are pinned to
 * the breakpoints of libs/responsiveColumns.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BREAKPOINT_PX } from '@/libs/responsiveColumns';

const read = file => fs.readFileSync(path.resolve(__dirname, file), 'utf8');

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

describe('the detail panel (FR-EXP-17)', () => {
    const page = read('ViewDataset.vue');
    const table = read('explorer/PropsTable.vue');

    it('clips nothing sideways and lets what it holds shrink', () => {
        expect(blockAt(page, page.indexOf('.detail-side {'))).toContain('overflow-x: hidden;');
        expect(blockAt(page, page.indexOf('.detail-side > * {'))).toContain('min-width: 0;');
    });

    it('opens as a drawer over the list below lg, the tablet width of responsiveColumns.js', () => {
        const lg = `${BREAKPOINT_PX.lg - 0.02}px`;
        expect(lg).toBe('991.98px');
        const at = page.indexOf(`@media (max-width: ${lg})`);
        expect(at).toBeGreaterThan(0);
        const media = blockAt(page, at);
        expect(blockAt(media, media.indexOf('.detail-side {'))).toMatch(/position: absolute;[\s\S]*width: min\(26rem, 100%\);/);
        expect(blockAt(media, media.indexOf('.detail-main.with-detail {'))).toContain('flex: 1;');
    });

    it('lays the property table out fixed, and wraps a long value in its cell', () => {
        expect(blockAt(table, table.indexOf('.props-datatable :deep(table) {'))).toMatch(/table-layout: fixed;\s*width: 100%;/);
        expect(blockAt(table, table.indexOf('.props-datatable :deep(.p-datatable-tbody > tr > td) {'))).toMatch(/min-width: 0;\s*overflow-wrap: anywhere;/);
        expect(blockAt(table, table.indexOf('.copyable-row > span,'))).toMatch(/min-width: 0;\s*overflow-wrap: anywhere;/);
    });
});

describe('the tabs below sm (FR-EXP-29)', () => {
    const tabs = read('TabSwitcher.vue');
    const phone = blockAt(tabs, tabs.indexOf(`@media only screen and (max-width: ${BREAKPOINT_PX.sm - 0.02}px)`));

    it('are the bottom navigation: the strip after the content, five equal cells', () => {
        expect(blockAt(phone, phone.indexOf('.tab-switcher.bottom-nav-phone .tab-buttons-strip {'))).toContain('order: 1;');
        expect(blockAt(phone, phone.indexOf('.tab-switcher.bottom-nav-phone :deep(.p-tab) {'))).toMatch(/flex: 1 1 0;\s*min-width: 0;\s*flex-direction: column;/);
    });

    it('show every label, not only the active one, and have no scroll arrows', () => {
        expect(blockAt(phone, phone.indexOf('.tab-switcher.bottom-nav-phone .tab-label {'))).toMatch(/position: static;\s*width: auto;\s*height: auto;/);
        expect(blockAt(phone, phone.indexOf(':deep(.p-tablist-nav-button) {'))).toContain('display: none;');
    });

    it('outrank the global rule that leaves a phone only the label of the active tab', () => {
        // .p-tab:not(.p-tab-active) .tab-label is 3 classes; this one is 3 classes and the component's attribute
        expect('.tab-switcher.bottom-nav-phone .tab-label'.split('.').length - 1).toBe(3);
        expect(read('../../../css/app.scss')).toContain('.p-tab:not(.p-tab-active) .tab-label {');
    });
});

describe('the dataset page (FR-EXP-29)', () => {
    const page = read('ViewDataset.vue');

    it('asks for a single pane and the bottom navigation on a phone', () => {
        expect(page).toContain(':mobile-collapsed="phoneLayout"');
        expect(page).toMatch(/<TabSwitcher[^>]*bottom-nav-phone/);
    });

    it('decides the phone layout from the window below sm, through the one breakpoint helper, not from the screen', () => {
        expect(page).toContain('const phoneLayout = useStackedLayout();');
        expect(page).not.toContain('@/libs/responsive\'');
        // no first pane of 0% on a phone that is wider than sm (landscape): the tree takes its usual width there
        expect(page).not.toContain('mobile-amount');
    });
});
