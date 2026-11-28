import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadProgress from './LoadProgress.vue';

describe('LoadProgress', () => {
    it('shows the percentage and fills the bar to it', () => {
        const w = mount(LoadProgress, { props: { progress: 0.426 } });
        expect(w.text()).toBe('43%');
        expect(w.find('.progress-fill').attributes('style')).toContain('width: 43%');
        expect(w.find('[role=progressbar]').attributes('aria-valuenow')).toBe('43');
    });

    it('shows nothing while the total is not known', () => {
        expect(mount(LoadProgress, { props: { progress: null } }).find('.progress-track').exists()).toBe(false);
        expect(mount(LoadProgress).find('.progress-track').exists()).toBe(false);
    });

    it('keeps the bar between 0 and 100', () => {
        expect(mount(LoadProgress, { props: { progress: 1.4 } }).text()).toBe('100%');
        expect(mount(LoadProgress, { props: { progress: -0.2 } }).text()).toBe('0%');
    });
});
