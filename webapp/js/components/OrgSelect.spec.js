/**
 * OrgSelect: a Select of organizations that shows the logo (or the name alone, where an organization has none) in its list
 * and in the box of the choice; the v-model is the slug and the attributes go to the Select.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import OrgSelect from './OrgSelect.vue';

let wrapper;
const organizations = [
    { slug: 'acme', name: 'Acme', logoUrl: '/orgs/acme/logo?v=1' },
    { slug: 'survey-team', name: '', logoUrl: null }
];
const render = props => (wrapper = mount(OrgSelect, {
    props: { organizations, ...props }, attachTo: document.body, global: { plugins: [PrimeVue] }
}));
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('OrgSelect', () => {
    it('shows the logo of the chosen organization before its name, in the box', () => {
        render({ modelValue: 'acme' });
        const box = wrapper.find('.p-select-label');
        expect(box.find('img').attributes('src')).toBe('/orgs/acme/logo?v=1');
        expect(box.text()).toBe('Acme');
    });

    it('shows the initials and the slug of one that has no logo and no name', () => {
        render({ modelValue: 'survey-team' });
        const box = wrapper.find('.p-select-label');
        expect(box.find('.org-logo-initials').text()).toBe('ST');
        expect(box.text()).toContain('survey-team');
    });

    it('shows the placeholder while nothing is chosen', () => {
        render({ modelValue: null, placeholder: 'Select an organization' });
        expect(wrapper.find('.p-select-label').text()).toBe('Select an organization');
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('shows the logo of each organization in the list, and chooses by slug', async () => {
        render({ modelValue: null, placeholder: 'Choose' });
        await wrapper.find('.p-select').trigger('click');
        const items = [...document.body.querySelectorAll('.p-select-option')];
        expect(items.map(item => item.querySelector('.org-select-name').textContent)).toEqual(['Acme', 'survey-team']);
        expect(items[0].querySelector('img').getAttribute('src')).toBe('/orgs/acme/logo?v=1');
        items[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted('update:modelValue')[0]).toEqual(['acme']);
    });

    it('passes its attributes to the Select', () => {
        render({ modelValue: null, inputId: 'the-org', disabled: true });
        expect(wrapper.find('#the-org').exists()).toBe(true);
        expect(wrapper.find('.p-select').classes()).toContain('p-disabled');
    });
});
