/**
 * The build state in the shell (FR-VWR-08): a file that cannot open yet shows its state over the view, with the Build /
 * Rebuild button when the viewer says the user can build, and 'build' when it is clicked.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'o', ds: 'd', encodedPath: '' } }), RouterLink: { template: '<a><slot /></a>' } }));
const ViewerShell = (await import('./ViewerShell.vue')).default;

const notice = (extra = {}) => ({
    status: 'failed', title: 'The build failed', text: 'The build of this file failed. Rebuild it to try again.', percent: null,
    canBuild: true, actionLabel: 'Rebuild', error: '', ...extra
});
const mountShell = build => mount(ViewerShell, { props: { build }, slots: { default: '<canvas />' }, global: { stubs: { RouterLink: true } } });

describe('ViewerShell build state', () => {
    it('shows nothing without a build state', () => {
        expect(mountShell(null).find('.viewer-build').exists()).toBe(false);
    });

    it('shows the title, the text and the Rebuild button, which emits build', async () => {
        const w = mountShell(notice());
        expect(w.find('.viewer-build-title').text()).toBe('The build failed');
        expect(w.find('.viewer-build-text').text()).toContain('Rebuild it to try again');
        const button = w.find('.viewer-build button');
        expect(button.text()).toContain('Rebuild');
        await button.trigger('click');
        expect(w.emitted('build')).toHaveLength(1);
    });

    it('has no button while the build runs or for somebody who cannot build, and spins while it runs', () => {
        const running = mountShell(notice({ status: 'building', title: 'Building… 40 %', canBuild: false }));
        expect(running.find('.viewer-build button').exists()).toBe(false);
        expect(running.find('.viewer-build-icon').classes()).toContain('fa-spin');
        expect(running.find('.viewer-build').attributes('role')).toBe('status');

        expect(mountShell(notice({ canBuild: false })).find('.viewer-build button').exists()).toBe(false);
    });

    it('says why the build could not start', () => {
        expect(mountShell(notice({ error: 'Build already in progress' })).find('.viewer-build-error').text()).toBe('Build already in progress');
    });
});
