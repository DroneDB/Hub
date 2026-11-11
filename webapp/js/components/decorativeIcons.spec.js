import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';
import PrimeVue from 'primevue/config';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { decorativeIcons } from '../../../scripts/lib/decorativeIcons.cjs';
import { primeVueOptions } from '@/theme';
import EntryThumbnail from '@/features/dataset/explorer/EntryThumbnail.vue';

/** The component of a template compiled as webpack compiles the Hub's templates. */
function component(template) {
    const { code } = compile(template, { nodeTransforms: [decorativeIcons], mode: 'function' });
    return { render: new Function('Vue', code)(Vue) };
}
const render = template => mount(component(template));

describe('the icons of the templates', () => {
    it('are hidden from screen readers, so a name reads "Map" and not " Map"', () => {
        const w = render('<div role="tab"><i class="fa-solid fa-map" /><span>Map</span></div>');
        expect(w.find('i').attributes('aria-hidden')).toBe('true');
        const bound = render('<div><i class="icon" :class="\'fa-solid fa-folder\'" /></div>');
        expect(bound.find('i').attributes('aria-hidden')).toBe('true');
    });

    it('keep what an icon that says something says', () => {
        for (const attrs of ['aria-label="Failed"', 'title="Failed"', ':title="\'Failed\'"', 'role="img" aria-label="x"', 'aria-hidden="false"', 'v-bind="{ title: \'x\' }"']) {
            expect(render(`<div><i class="fa-solid fa-xmark" ${attrs} /></div>`).find('i').attributes('aria-hidden')).not.toBe('true');
        }
    });

    it('leave italic text alone', () => {
        expect(render('<p><i>emphasis</i></p>').find('i').attributes('aria-hidden')).toBeUndefined();
    });

    it('are hidden in the components of the Hub: a file tile is named by its file', async () => {
        const file = { label: 'langley.png', path: 'langley.png', entry: { path: 'langley.png', type: 2 }, selected: false };
        const w = mount(EntryThumbnail, { props: { file } });
        await Vue.nextTick();
        const icons = w.findAll('i');
        expect(icons.length).toBeGreaterThan(0);
        for (const i of icons) expect(i.attributes('aria-hidden')).toBe('true');
        expect(w.text()).toBe('langley.png');
        w.unmount();
    });
});

describe('the icons of PrimeVue buttons and menus', () => {
    it('are hidden from screen readers', () => {
        const global = { plugins: [[PrimeVue, primeVueOptions]] };
        const button = mount(Button, { props: { label: 'Save', icon: 'fa-solid fa-floppy-disk' }, global });
        expect(button.find('.fa-floppy-disk').attributes('aria-hidden')).toBe('true');
        const menu = mount(Menu, { props: { model: [{ label: 'Open', icon: 'fa-solid fa-folder-open' }] }, global });
        expect(menu.find('.fa-folder-open').attributes('aria-hidden')).toBe('true');
    });
});
