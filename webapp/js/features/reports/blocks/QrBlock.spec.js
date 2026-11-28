import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import QrBlock from './QrBlock.vue';
import { qrCode } from '@/libs/qr';

const render = block => mount(QrBlock, { props: { block } });

describe('QrBlock', () => {
    it('draws the code of an address of this Hub, the same pattern the PDF carries', async () => {
        const url = `${window.location.origin}/r/acme/site/reports/r_1#item-a1`;
        const wrapper = render({ url, label: 'Item 1' });
        await flushPromises();
        const svg = wrapper.find('[data-testid="qr-code"]');
        expect(svg.exists()).toBe(true);
        expect(svg.find('path').attributes('d')).toBe(qrCode(url).path);
        expect(svg.attributes('role')).toBe('img');
        expect(svg.attributes('aria-label')).toBe('QR code: Item 1');
    });

    it('writes the address as a link next to the code', async () => {
        const url = `${window.location.origin}/r/acme/site/reports/r_1`;
        const wrapper = render({ url, label: 'Open the live report' });
        await flushPromises();
        expect(wrapper.text()).toContain('Open the live report');
        expect(wrapper.find('a').attributes('href')).toBe(url);
    });

    it('draws no code for an address of another site, and shows the link', async () => {
        const wrapper = render({ url: 'https://evil.example/r/x', label: 'Item 1' });
        await flushPromises();
        expect(wrapper.find('[data-testid="qr-code"]').exists()).toBe(false);
        expect(wrapper.find('a').attributes('href')).toBe('https://evil.example/r/x');
    });

    it('draws the new code when the address changes', async () => {
        const first = `${window.location.origin}/a`;
        const second = `${window.location.origin}/b`;
        const wrapper = render({ url: first, label: 'x' });
        await flushPromises();
        await wrapper.setProps({ block: { url: second, label: 'x' } });
        await flushPromises();
        expect(wrapper.find('path').attributes('d')).toBe(qrCode(second).path);
    });
});
