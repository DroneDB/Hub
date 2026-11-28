/**
 * The location bar: the path of the folder shown and the actions on it (Refresh) at its end, in
 * every folder, the root too.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ExplorerLocationBar from './ExplorerLocationBar.vue';

const refreshTool = onClick => ({ id: 'refresh', title: 'Refresh', icon: 'fa-solid fa-rotate-right', onClick });
const mountBar = props => mount(ExplorerLocationBar, { props, global: { plugins: [PrimeVue] } });

describe('ExplorerLocationBar', () => {
    it('keeps Refresh at the end of the path, and runs it', async () => {
        const onClick = vi.fn();
        const w = mountBar({ path: 'a/b', rootPath: '/', tools: [refreshTool(onClick)] });
        expect(w.find('[aria-current="location"]').text()).toBe('b');
        const refresh = w.find('[data-tool="refresh"]');
        expect(refresh.attributes('aria-label')).toBe('Refresh');
        await refresh.trigger('click');
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('is there at the root too: the home icon is the folder shown', () => {
        const w = mountBar({ path: '', tools: [refreshTool(vi.fn())] });
        expect(w.find('[aria-current="location"]').attributes('aria-label')).toBe('Root folder');
        expect(w.find('[data-tool="refresh"]').exists()).toBe(true);
    });

    it('passes the navigation of the path on', async () => {
        const w = mountBar({ path: 'a/b', rootPath: '/' });
        await w.findAll('button')[1].trigger('click');
        expect(w.emitted('navigate')).toEqual([['a']]);
        expect(w.find('[data-tool]').exists()).toBe(false);
    });
});
