/**
 * TextPromptDialog (FR-MAP-23): the name it offers is in the field and selected when the field first gets the focus,
 * so typing replaces it and Enter keeps it; the answer is the trimmed text, null when cancelled.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TextPromptDialog from './TextPromptDialog.vue';

let wrapper;
const render = props => {
    wrapper = mount(TextPromptDialog, {
        props: { title: 'Save view', label: 'Name', ...props },
        global: { plugins: [PrimeVue], stubs: { Window: { props: ['title'], emits: ['confirm', 'close'], template: '<div><slot /></div>' } } },
        attachTo: document.body
    });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

const input = () => wrapper.find('input').element;

describe('TextPromptDialog', () => {
    it('has the offered name in the field', () => {
        render({ initialValue: 'Hat Creek' });
        expect(input().value).toBe('Hat Creek');
    });

    it('selects the whole offered name when the field first gets the focus', () => {
        render({ initialValue: 'Hat Creek' });
        input().focus();
        expect(input().selectionStart).toBe(0);
        expect(input().selectionEnd).toBe('Hat Creek'.length);
    });

    it('leaves the text alone when the focus comes again (a click to place the caret)', () => {
        render({ initialValue: 'Hat Creek' });
        input().focus();
        input().blur();
        input().setSelectionRange(3, 3);
        input().focus();
        expect(input().selectionStart).toBe(3);
        expect(input().selectionEnd).toBe(3);
    });

    it('has an empty field, and nothing to select, without an offered name', () => {
        render();
        input().focus();
        expect(input().value).toBe('');
        expect(input().selectionEnd).toBe(0);
    });
});
