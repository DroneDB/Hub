import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import HubMessage from './HubMessage.vue';

const BAD = '<img src="http:x" onerror="alert(1)"><h2>Session expired</h2><a class="btn" href="http:x">Sign in again</a>.txt';
const mountMessage = props => mount(HubMessage, { props, global: { plugins: [PrimeVue] } });

describe('HubMessage', () => {
    it('shows a text that looks like markup as that text, with no element made of it', () => {
        const wrapper = mountMessage({ modelValue: BAD });
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('h2').exists()).toBe(false);
        expect(wrapper.find('a').exists()).toBe(false);
        expect(wrapper.text()).toContain(BAD);
    });

    it('keeps the line breaks of the text', () => {
        const wrapper = mountMessage({ modelValue: 'first\n\nsecond' });
        expect(wrapper.find('.hub-message-text').text()).toBe('first\n\nsecond');
    });

    it('shows markup, sanitised, only when the host asks for it', () => {
        const wrapper = mountMessage({ modelValue: 'a <b>bold</b> <img src=x onerror="alert(1)">word', html: true });
        expect(wrapper.find('b').text()).toBe('bold');
        expect(wrapper.html()).not.toContain('onerror');
    });

    it('is empty with no text', () => {
        expect(mountMessage({ modelValue: '' }).text()).toBe('');
    });
});
