/**
 * The Mask Borders window says what the tool does: it masks black borders only (the request
 * never asks for white ones), and links to its documentation page.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import MaskBordersDialog from './MaskBordersDialog.vue';
import { DOCS } from '@/libs/docsLinks';

const mountDialog = () => mount(MaskBordersDialog, {
    props: { entry: { entry: { path: 'odm_orthophoto.tif' } } },
    global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
});

describe('MaskBordersDialog', () => {
    it('promises black borders only', () => {
        const text = mountDialog().text();
        expect(text).toContain('black border pixels');
        expect(text).not.toMatch(/white/i);
    });

    it('links to the Mask Borders page of the docs', () => {
        expect(mountDialog().find('a').attributes('href')).toBe(DOCS.maskBorders);
    });
});
