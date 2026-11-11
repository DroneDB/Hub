/**
 * The view bar in each state of the viewer: who sees which button, when the unsaved mark shows,
 * what a save in progress does to the buttons, and that a name is only ever text.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ViewBar from './ViewBar.vue';
import { STACKED_MEDIA_QUERY } from '@/libs/responsiveColumns';

let wrapper;
afterEach(() => wrapper?.unmount());

const render = props => {
    wrapper = mount(ViewBar, { props: { name: 'Ortho over DSM', ...props }, global: { plugins: [PrimeVue] } });
    return wrapper;
};
const buttons = () => wrapper.findAll('button').map(b => b.text());
const button = label => wrapper.findAll('button').find(b => b.text() === label);
const mark = () => wrapper.text().includes('Unsaved changes');

describe('ViewBar', () => {
    it('is a toolbar named View', () => {
        render({});
        expect(wrapper.attributes('role')).toBe('toolbar');
        expect(wrapper.attributes('aria-label')).toBe('View');
    });

    it('a new view of a writer: the name and Save only', () => {
        render({ canWrite: true });
        expect(wrapper.text()).toContain('Ortho over DSM');
        expect(buttons()).toEqual(['Save']);
        expect(button('Save').attributes('title')).toBe('Save this view in the dataset');
    });

    it('a saved view of a writer: Save and Save as new', () => {
        render({ canWrite: true, saved: true });
        expect(buttons()).toEqual(['Save', 'Save as new']);
        expect(button('Save').attributes('title')).toBe('Save the changes to this view');
        expect(button('Save as new').attributes('title')).toBe('Save as a new view');
    });

    it('a reader sees the name only, with no button and no mark', () => {
        render({ saved: true, dirty: true });
        expect(wrapper.text()).toContain('Ortho over DSM');
        expect(buttons()).toEqual([]);
        expect(mark()).toBe(false);
    });

    it('shows the mark, as text, to a writer when the saved view changed', () => {
        render({ canWrite: true, saved: true, dirty: true });
        expect(mark()).toBe(true);
        expect(buttons()).toEqual(['Save', 'Save as new']);
    });

    it('has no mark when the view is clean', () => {
        render({ canWrite: true, saved: true });
        expect(mark()).toBe(false);
    });

    it('disables the buttons and shows them as loading while a save runs', () => {
        render({ canWrite: true, saved: true, busy: true });
        for (const label of ['Save', 'Save as new']) {
            expect(button(label).attributes('disabled')).toBeDefined();
            expect(button(label).classes()).toContain('p-button-loading');
        }
    });

    it('asks the viewer to save, and to save as new', async () => {
        render({ canWrite: true, saved: true });
        await button('Save').trigger('click');
        await button('Save as new').trigger('click');
        expect(wrapper.emitted('save')).toHaveLength(1);
        expect(wrapper.emitted('saveAsNew')).toHaveLength(1);
    });

    it('does not ask while a save runs', async () => {
        render({ canWrite: true, saved: true, busy: true });
        await button('Save').trigger('click');
        expect(wrapper.emitted('save')).toBeUndefined();
    });

    it('keeps a long name on one line, with the whole name as its title', () => {
        const long = 'North field after the storm, all flights of the week, ortho over DSM and DTM'.repeat(2);
        render({ name: long, canWrite: true, saved: true, dirty: true });
        const name = wrapper.find('.view-name');
        expect(name.attributes('title')).toBe(long);
        expect(name.text()).toBe(long);
    });

    it('renders a name as text, never as markup', () => {
        const name = '<img src=x onerror=alert(1)><b>bold</b>';
        render({ name });
        expect(wrapper.find('.view-name').text()).toBe(name);
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('b').exists()).toBe(false);
        expect(wrapper.find('.view-name').attributes('title')).toBe(name);
    });
});

describe('ViewBar on a phone (FR-MAP-12)', () => {
    const original = window.matchMedia;
    afterEach(() => { window.matchMedia = original; });

    /** A window below sm: the media query of the stacked layout matches */
    const onPhone = () => {
        const queries = [];
        window.matchMedia = vi.fn(query => {
            queries.push(query);
            return { matches: true, addEventListener() {}, removeEventListener() {} };
        });
        return queries;
    };
    const more = () => wrapper.find('button[aria-label="View actions"]');
    const items = () => [...document.body.querySelectorAll('[role="menuitem"]')].map(i => i.textContent.trim());

    it('asks the window by the query of the stacked layout (below sm)', () => {
        const queries = onPhone();
        render({ canWrite: true });
        expect(queries).toEqual([STACKED_MEDIA_QUERY]);
    });

    it('has no Save buttons beside the name, only the menu button, for a writer', () => {
        onPhone();
        render({ canWrite: true, saved: true, dirty: true });
        expect(buttons()).toEqual(['']);
        expect(more().exists()).toBe(true);
        expect(more().attributes('aria-haspopup')).toBe('true');
        expect(wrapper.text()).toContain('Ortho over DSM');
        expect(mark()).toBe(true);
    });

    it('has no menu for a reader', () => {
        onPhone();
        render({ saved: true });
        expect(more().exists()).toBe(false);
        expect(buttons()).toEqual([]);
    });

    it('lists Save and Save as new in the menu of a saved view, and asks to save from them', async () => {
        onPhone();
        render({ canWrite: true, saved: true });
        await more().trigger('click');
        expect(items()).toEqual(['Save', 'Save as new']);
        const links = [...document.body.querySelectorAll('[role="menuitem"] .p-menu-item-link')];
        links[0].click();
        links[1].click();
        expect(wrapper.emitted('save')).toHaveLength(1);
        expect(wrapper.emitted('saveAsNew')).toHaveLength(1);
    });

    it('lists only Save for a new view', async () => {
        onPhone();
        render({ canWrite: true });
        await more().trigger('click');
        expect(items()).toEqual(['Save']);
    });
});
