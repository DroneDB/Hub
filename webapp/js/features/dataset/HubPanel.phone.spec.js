/**
 * The dataset page on a phone (FR-EXP-29): below `sm` (the window's width, the breakpoint of libs/responsiveColumns.js,
 * not the screen of `isMobile`) the page shows only its second pane: no first pane and no gutter handle at the left
 * edge; it follows the window without rendering the second pane again; the tabs are a bottom navigation with an icon
 * and a label in each of five equal cells.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, getCurrentInstance, onUnmounted, ref } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import PrimeVue from 'primevue/config';
import HubPanel from './HubPanel.vue';
import TabSwitcher from './TabSwitcher.vue';
import { STACKED_MEDIA_QUERY } from '@/libs/responsiveColumns';

vi.mock('@/libs/responsive', () => ({ isMobile: () => true, isTablet: () => false }));

const originalMatchMedia = window.matchMedia;
afterEach(() => {
    window.matchMedia = originalMatchMedia;
});

/** A window below (true) or from (false) `sm`; the listeners the component registers are returned */
function windowIs(phone) {
    const listeners = [];
    const queries = [];
    window.matchMedia = vi.fn(query => {
        queries.push(query);
        const media = {
            matches: phone,
            addEventListener: (_, fn) => listeners.push(fn),
            removeEventListener: (_, fn) => listeners.splice(listeners.indexOf(fn), 1)
        };
        return media;
    });
    return { listeners, queries };
}

const mountPanel = (props, second = '<p class="main">main</p>') => mount(HubPanel, {
    props: { amount: '23.6%', tabletAmount: '30%', ...props },
    slots: { first: '<p class="tree">tree</p>', second },
    global: { plugins: [PrimeVue] }
});

/** The window crosses `sm`: the change event of the media query */
const resize = async (w, media, phone) => {
    media.listeners.slice().forEach(fn => fn({ matches: phone }));
    await w.vm.$nextTick();
};

describe('HubPanel mobile-collapsed', () => {
    it('below sm shows only the second pane: the first pane is not rendered, the splitter is collapsed (no handle)', () => {
        const media = windowIs(true);
        const w = mountPanel({ mobileCollapsed: true });
        expect(media.queries).toEqual([STACKED_MEDIA_QUERY]);
        expect(STACKED_MEDIA_QUERY).toBe('(max-width: 575.98px)');
        expect(w.find('.main').exists()).toBe(true);
        // no empty first pane: its content is not there, and the stylesheet hides the pane and the handle
        expect(w.find('.tree').exists()).toBe(false);
        expect(w.find('.p-splitter').classes()).toContain('panel-collapsed');
        w.unmount();
    });

    it('keeps the splitter from sm up', () => {
        windowIs(false);
        const w = mountPanel({ mobileCollapsed: true });
        expect(w.find('.p-splitter').classes()).not.toContain('panel-collapsed');
        expect(w.find('.panel-gutter').exists()).toBe(true);
        expect(w.find('.tree').exists()).toBe(true);
        w.unmount();
    });

    it('does not collapse when the page does not ask for it, also on a phone', () => {
        windowIs(true);
        const w = mountPanel({});
        expect(w.find('.p-splitter').classes()).not.toContain('panel-collapsed');
        expect(w.find('.tree').exists()).toBe(true);
        w.unmount();
    });

    it('keeps the second pane\'s component, and its state, when the window goes from 390 to 844 px and back', async () => {
        const media = windowIs(true);
        const created = [];
        const unmounted = [];
        // A pane that counts its instances and keeps a state of its own (the tab on show, the map)
        const Second = defineComponent({
            setup() {
                const state = ref('initial');
                const instance = getCurrentInstance();
                created.push(instance);
                onUnmounted(() => unmounted.push(instance));
                return { state };
            },
            template: '<p class="main">{{ state }}</p>'
        });
        const w = mountPanel({ mobileCollapsed: true }, Second);
        w.findComponent(Second).vm.state = 'kept';
        await w.vm.$nextTick();
        const element = w.find('.main').element;

        await resize(w, media, false);
        expect(w.find('.p-splitter').classes()).not.toContain('panel-collapsed');
        expect(w.find('.tree').exists()).toBe(true);
        expect(created[0].isUnmounted).toBe(false);
        expect(w.find('.main').element === element).toBe(true);
        expect(w.find('.main').text()).toBe('kept');

        await resize(w, media, true);
        expect(w.find('.p-splitter').classes()).toContain('panel-collapsed');
        expect(w.find('.main').element === element).toBe(true);
        expect(w.find('.main').text()).toBe('kept');
        expect(created).toHaveLength(1);
        expect(unmounted).toHaveLength(0);
        w.unmount();
    });

    it('hides the first pane and the handle in its stylesheet when collapsed, and gives the second pane the width', () => {
        const sfc = fs.readFileSync(path.resolve(__dirname, 'HubPanel.vue'), 'utf8');
        expect(sfc).toMatch(/\.panel-splitter\.panel-collapsed > :deep\(\.p-splitterpanel:first-child\),\s*\.panel-splitter\.panel-collapsed > :deep\(\.panel-gutter\) \{\s*display: none;\s*\}/);
        expect(sfc).toMatch(/\.panel-splitter\.panel-collapsed > :deep\(\.p-splitterpanel:last-child\) \{\s*flex-basis: 100% !important;\s*\}/);
        // One Splitter, the second slot once: no other branch renders the second pane
        expect(sfc.match(/<slot name="second" \/>/g)).toHaveLength(1);
        expect(sfc).not.toContain('v-if="collapsed"');
    });
});

describe('TabSwitcher bottom-nav-phone', () => {
    const tabs = [
        { label: 'Browser', key: 'filebrowser', icon: 'fa-solid fa-sitemap' },
        { label: 'Files', key: 'explorer', icon: 'fa-solid fa-folder-open' },
        { label: 'Properties', key: 'properties', icon: 'fa-solid fa-circle-info' },
        { label: 'Map', key: 'map', icon: 'fa-solid fa-map' },
        { label: 'Tasks', key: 'tasks', icon: 'fa-solid fa-list-check' }
    ];

    it('marks the switcher for the bottom navigation and keeps the five tabs, each with an icon and a label', () => {
        const w = mount(TabSwitcher, { props: { tabs, position: 'top', bottomNavPhone: true }, global: { plugins: [PrimeVue] } });
        expect(w.find('.tab-switcher').classes()).toContain('bottom-nav-phone');
        const cells = w.findAll('[role="tab"]');
        expect(cells.map(c => c.find('.tab-label').text())).toEqual(['Browser', 'Files', 'Properties', 'Map', 'Tasks']);
        for (const cell of cells) expect(cell.find('i.icon').exists()).toBe(true);
        w.unmount();
    });

    it('does not mark it when the page does not ask for it', () => {
        const w = mount(TabSwitcher, { props: { tabs, position: 'top' }, global: { plugins: [PrimeVue] } });
        expect(w.find('.tab-switcher').classes()).not.toContain('bottom-nav-phone');
        w.unmount();
    });
});
