import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TabSwitcher from './TabSwitcher.vue';

const tabs = [{ label: 'Files', key: 'explorer' }, { label: 'Map', key: 'map' }];
const mountTabs = () => mount(TabSwitcher, {
    props: { tabs },
    slots: { explorer: '<p>files</p>', map: '<p>map</p>' },
    global: { plugins: [PrimeVue] }
});

describe('TabSwitcher', () => {
    it('activates a tab given in the props by key', async () => {
        const w = mountTabs();
        expect(w.vm.activeTab).toBe('explorer');
        w.vm.activateTab('map');
        expect(w.vm.activeTab).toBe('map');
        expect(w.emitted('tabChange').at(-1)).toEqual(['map']);
        w.unmount();
    });

    it('ignores an unknown key', () => {
        const w = mountTabs();
        w.vm.activateTab('nope');
        expect(w.vm.activeTab).toBe('explorer');
        w.unmount();
    });
});
