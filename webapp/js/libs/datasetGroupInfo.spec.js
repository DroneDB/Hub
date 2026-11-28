/**
 * The dialogs about the Views and Reports groups name each button with the icon the user sees on it: the icons are
 * those of the buttons and menu items of the map viewer, the report page and the groups.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SAVED_VIEWS_INFO, REPORTS_INFO, BUTTON_ICONS, GROUP_ACTION_ICONS } from './datasetGroupInfo';
import { SAVE_ICON } from './glyphs';

const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

// The buttons a line names: { label, icon }
const buttons = info => info.sections.flatMap(s => [s.text, ...(s.items || [])])
    .filter(Array.isArray).flat().filter(part => typeof part === 'object');

describe('the dialogs about views and reports', () => {
    it('name the buttons that make and use a view and a report, with their icons', () => {
        const views = Object.fromEntries(buttons(SAVED_VIEWS_INFO).map(b => [b.label, b.icon]));
        expect(Object.keys(views)).toEqual(expect.arrayContaining(['Add layer', 'Save view', 'Save as view', 'Open', 'Copy Link', 'Rename', 'Delete']));
        const reports = Object.fromEntries(buttons(REPORTS_INFO).map(b => [b.label, b.icon]));
        expect(Object.keys(reports)).toEqual(expect.arrayContaining(['New report', 'Report', 'Create report', 'Open', 'Copy Link', 'Edit',
            'Duplicate', 'Delete', 'Download PDF', 'Publish PDF']));
        expect(reports['New report']).toBe(GROUP_ACTION_ICONS.add);
    });

    it('show the icons the buttons of the map viewer and the report page have', () => {
        expect(source('features/viewers/map/AddLayerButton.vue')).toMatch(new RegExp(`<i class="${BUTTON_ICONS.addLayer}" /> Add layer`));
        const viewBar = source('features/viewers/map/ViewBar.vue');
        expect(viewBar).toContain(`icon="${SAVE_ICON}" label="Save view"`);
        expect(viewBar).toContain(`label: 'Save as new view', icon: '${BUTTON_ICONS.saveAsNewView}'`);
        expect(viewBar).toContain('icon="fa-solid fa-ellipsis-vertical" aria-label="View actions"');
        const toolbar = source('features/viewers/map/MapToolbar.vue');
        expect(toolbar).toMatch(/aria-label="Report"[^>]*>\s*<i :class="REPORT_ICON" \/>/);
        expect(toolbar).toMatch(/aria-label="Save as view"[^>]*>\s*<i :class="VIEWS_ICON" \/>/);
        const exportButtons = source('features/reports/ReportExport.vue');
        expect(exportButtons).toContain(`icon="${BUTTON_ICONS.downloadPdf}" label="Download PDF"`);
        expect(exportButtons).toContain(`icon="${BUTTON_ICONS.publishPdf}" label="Publish PDF"`);
    });
});
