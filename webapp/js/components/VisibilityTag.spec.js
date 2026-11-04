import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { Visibility } from 'ddb';
import VisibilityTag from './VisibilityTag.vue';
import { visibilityLabel, visibilityLook } from '@/libs/visibility';

const render = (visibility, attrs = {}) => mount(VisibilityTag, { props: { visibility }, attrs, global: { plugins: [PrimeVue] } });

describe('VisibilityTag', () => {
    it('Private is a neutral tag with a lock: not a warning, not a second red next to Delete', () => {
        const tag = render(Visibility.PRIVATE);
        expect(tag.text()).toBe('Private');
        expect(tag.classes()).toContain('p-tag-secondary');
        expect(tag.classes()).not.toContain('p-tag-warn');
        expect(tag.classes()).not.toContain('p-tag-danger');
        expect(tag.find('.fa-lock').exists()).toBe(true);
    });

    it('Public is green with a globe, Unlisted the brand blue', () => {
        const pub = render(Visibility.PUBLIC);
        expect(pub.text()).toBe('Public');
        expect(pub.classes()).toContain('p-tag-success');
        expect(pub.find('.fa-globe').exists()).toBe(true);
        const unlisted = render(Visibility.UNLISTED);
        expect(unlisted.text()).toBe('Unlisted');
        expect(unlisted.classes()).toContain('p-tag-info');
    });

    it('an unknown or missing visibility shows as Private', () => {
        expect(render(null).text()).toBe('Private');
        expect(render(7).text()).toBe('Private');
        expect(visibilityLabel(undefined)).toBe('Private');
    });

    it('passes Tag attributes through (a rounded tag on the organization pages)', () => {
        expect(render(Visibility.PUBLIC, { rounded: true }).classes()).toContain('p-tag-rounded');
    });

    it('no visibility is shown in warning orange', () => {
        for (const v of Object.values(Visibility)) expect(visibilityLook(v).severity).not.toBe('warn');
    });
});
