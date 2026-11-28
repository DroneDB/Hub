/**
 * A viewer of a busy dataset (an import or a rescan of its index runs): its file answers 409 busy, and the shell shows the
 * same busy state as the dataset page, with the progress from the task store and the Cancel the Registry offers. The way
 * back is the datasets list (the dataset page would only say that it is busy). When the task ends the dataset page opens;
 * an import that did not succeed has its dataset deleted, and the list opens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';

const h_ = vi.hoisted(() => ({ dataset: null, busy: null, tasks: {}, handlers: {}, confirm: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { Organization: () => ({ Dataset: () => h_.dataset }), isLoggedIn: () => true, getUsername: () => 'u', features: { value: () => null, get: () => false } }
}));
vi.mock('@/libs/tasks/taskMonitor', async importOriginal => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: {
            on: (event, fn) => { (h_.handlers[event] ||= []).push(fn); },
            off: (event, fn) => { h_.handlers[event] = (h_.handlers[event] || []).filter(f => f !== fn); },
            getBusy: () => h_.busy,
            getTask: (_dataset, taskId) => h_.tasks[taskId] ?? null,
            trackBusy: vi.fn(),
            forceRefresh: () => Promise.resolve(),
            followCancelled: () => false
        },
        datasetKey: ds => ds.baseApi
    };
});
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => options => h_.confirm(options) }));

const { default: ViewerShell } = await import('./ViewerShell.vue');
const { ApiError } = await import('@/libs/ddb/apiError');
const { b64encode } = await import('@/libs/base64');

const Page = { render: () => null };
const busyAnswer = kind => new ApiError('busy', 409, { datasetBusy: kind, taskId: 'task-1', noRetry: true });
const emit = (event, payload) => (h_.handlers[event] || []).forEach(fn => fn({ dataset: h_.dataset, ...payload }));

let wrapper;
let router;
async function render(loadError) {
    globalThis.HubOptions = {};
    router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Page },
            { path: '/r/:org', name: 'Datasets', component: Page },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: Page },
            { path: '/r/:org/:ds/view/:encodedPath/map', name: 'Map', component: Page }
        ]
    });
    await router.push(`/r/acme/site/view/${encodeURIComponent(b64encode('ortho.tif'))}/map`);
    wrapper = mount(ViewerShell, { props: { loadError }, slots: { default: '<div class="viewer-content" />' }, global: { plugins: [router, PrimeVue], provide: { embed: false } } });
    await flushPromises();
}

beforeEach(() => {
    h_.dataset = { baseApi: 'acme/site', cancelTask: vi.fn(() => Promise.resolve({ deleted: true })), getTask: vi.fn() };
    h_.busy = null;
    h_.tasks = {};
    h_.handlers = {};
    h_.confirm = vi.fn(() => Promise.resolve(true));
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('ViewerShell of a busy dataset', () => {
    it('shows the busy state with the progress of the store, and goes back to the datasets list', async () => {
        await render(busyAnswer('importing'));
        expect(wrapper.find('h1').text()).toBe('This dataset is being imported');
        expect(wrapper.find('.resource-state-progress').text()).toBe('Importing…');

        h_.busy = { kind: 'importing', taskId: 'task-1', progress: 30 };
        emit('tasksUpdated');
        await flushPromises();
        expect(wrapper.find('.resource-state-progress').text()).toBe('Importing… 30 %');

        const back = wrapper.findAll('.resource-state a').find(a => a.text().includes('Back to datasets'));
        expect(back.attributes('href')).toBe('/r/acme');
        expect(wrapper.find('a.viewer-back').attributes('href')).toBe('/r/acme');
        expect(wrapper.find('a.viewer-back').attributes('aria-label')).toBe('Back to datasets');
    });

    it('offers Cancel rescan when the Registry offers it, asks, and cancels the task', async () => {
        h_.tasks['task-1'] = { taskId: 'task-1', toolId: 'rescan-index', state: 'Processing', actions: ['cancel'] };
        await render(busyAnswer('rescanning'));
        const cancel = wrapper.findAll('button.resource-state-action').find(b => b.text() === 'Cancel rescan');

        await cancel.trigger('click');
        await flushPromises();

        expect(h_.confirm.mock.calls[0][0].message).toContain('<strong>Index rescan</strong> will be stopped.');
        expect(h_.dataset.cancelTask).toHaveBeenCalledWith('task-1');
    });

    it('opens the dataset when the rescan ends, and the list when an import ends without success', async () => {
        await render(busyAnswer('rescanning'));
        emit('busyEnded', { task: { taskId: 'task-1', state: 'Succeeded' }, gone: false, kind: 'rescanning' });
        await flushPromises();
        expect(router.currentRoute.value.name).toBe('ViewDataset');
        wrapper.unmount();

        await render(busyAnswer('importing'));
        emit('busyEnded', { task: { taskId: 'task-1', state: 'Deleted' }, gone: false, kind: 'importing' });
        await flushPromises();
        expect(router.currentRoute.value).toMatchObject({ name: 'Datasets', params: { org: 'acme' } });
    });

    it('keeps the way back to the dataset for any other state', async () => {
        await render(new ApiError('Not found', 404));
        expect(wrapper.find('a.viewer-back').attributes('href')).toBe('/r/acme/site');
        expect(wrapper.findAll('button.resource-state-action').some(b => b.text().startsWith('Cancel'))).toBe(false);
    });
});
