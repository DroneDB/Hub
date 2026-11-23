/**
 * The info dialog: a summary, headed sections, the buttons a line names shown with their icon and their label, the
 * documentation link, and Close.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import InfoDialog from './InfoDialog.vue';
import { SAVED_VIEWS_INFO } from '@/libs/datasetGroupInfo';

const mountDialog = props => mount(InfoDialog, {
    props,
    global: { plugins: [PrimeVue], stubs: { Window: { props: ['title'], template: '<div><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' } } }
});

describe('InfoDialog', () => {
    it('shows a button a line names as its icon and its label in bold, and plain lines as text', () => {
        const w = mountDialog({ ...SAVED_VIEWS_INFO });
        expect(w.find('h2').text()).toBe('About views');
        const refs = w.findAll('.ui-ref');
        const save = refs.find(r => r.text() === 'Save view');
        expect(save.find('strong').text()).toBe('Save view');
        expect(save.find('i').classes()).toEqual(expect.arrayContaining(['fa-solid', 'fa-floppy-disk']));
        expect(save.find('i').attributes('aria-hidden')).toBe('true');
        // A button with no icon is its label alone
        expect(refs.find(r => r.text() === 'Save as new view').find('i').exists()).toBe(false);
        expect(w.text()).toContain('Deleting a view does not delete its files');
        expect(w.find('a').attributes('href')).toBe(SAVED_VIEWS_INFO.docsUrl);
    });

    it('shows text as text, and closes on Close', async () => {
        const w = mountDialog({ id: 'x', title: 'T', summary: '<b>s</b>', sections: [{ heading: 'H', text: ['<i>a</i> ', { label: '<b>B</b>' }] }] });
        expect(w.find('b').exists()).toBe(false);
        expect(w.text()).toContain('<b>s</b>');
        expect(w.find('.ui-ref strong').text()).toBe('<b>B</b>');
        const close = w.findAll('button').find(b => b.text() === 'Close');
        await close.trigger('click');
        expect(w.emitted('close')).toHaveLength(1);
    });
});
