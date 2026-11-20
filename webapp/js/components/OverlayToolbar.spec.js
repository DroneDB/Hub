/**
 * The toolbar of a dark 3D view: one look for every bar of a viewer, taken by what stands in it from its markup.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { readSource } from '@/specs/cssSource';
import OverlayToolbar from './OverlayToolbar.vue';

let wrapper;
afterEach(() => wrapper?.unmount());

describe('OverlayToolbar', () => {
    it('is a toolbar with the name it is given, around the tools it is given', () => {
        wrapper = mount(OverlayToolbar, { props: { label: 'Display' }, slots: { default: '<button type="button">Top</button>' } });
        expect(wrapper.attributes('role')).toBe('toolbar');
        expect(wrapper.attributes('aria-label')).toBe('Display');
        expect(wrapper.find('button').text()).toBe('Top');
    });
});

describe('OverlayToolbar look', () => {
    const source = readSource(__dirname, 'OverlayToolbar.vue');
    const shared = readSource(__dirname, '../../css/_overlay-button.scss');

    it('has the surface and the button of the overlays of a viewer, not ones of its own', () => {
        expect(source).toMatch(/\.overlay-toolbar \{\s*@include overlay-surface;/);
        expect(source).toMatch(/\.overlay-toolbar :deep\(#\{\$tool\}\) \{\s*@include toolbar-button;/);
        expect(shared).toMatch(/@mixin overlay-surface \{\s*background: var\(--ddb-overlay-bg\);/);
    });

    it('styles every button as a tool but the items of a menu and the actions of a hint', () => {
        expect(source).toContain(`$tool: 'button:not([role="menuitem"], .hint-action)';`);
    });

    it('makes a tool with a name as wide as the name, so a bar can mix icons and named tools', () => {
        expect(source).toMatch(/:deep\(#\{\$tool\}:has\(\.tool-label\)\) \{\s*width: auto;/);
    });

    it('puts the hint of a tool on a line after every tool, wherever that tool stands in the bar', () => {
        expect(source).toMatch(/:deep\(\.tool-hint\) \{\s*order: 1;\s*flex-basis: 100%;/);
    });

    it('dims a choice whose select is off, not one that has an option that is off', () => {
        expect(source).toContain('&:has(select:disabled) {');
        expect(source).not.toMatch(/:has\(:disabled\)/);
    });

    it('fills only the action that saves, and shows a tool that deletes in the danger colour while it is on', () => {
        expect(source).toMatch(/:deep\(#\{\$tool\}\.primary\) \{\s*background: var\(--ddb-viewer-btn-primary\);/);
        expect(source).toMatch(/:deep\(#\{\$tool\}\.danger\.active\) \{\s*background: var\(--ddb-viewer-btn-danger\);/);
    });

    it('draws a choice as a tool: a select with no fill and no border, and a list with a fill of its own', () => {
        const select = source.slice(source.indexOf(':deep(.tool-select)'));
        expect(select).toMatch(/appearance: none;/);
        expect(select).toMatch(/border: none;/);
        expect(select).toMatch(/background: transparent;/);
        expect(select).toMatch(/option \{\s*background: var\(--ddb-viewer-select-bg\);\s*color: var\(--ddb-text-on-dark\);/);
    });
});
