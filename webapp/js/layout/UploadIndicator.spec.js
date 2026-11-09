/**
 * UploadIndicator (FR-UPL-04, FR-XC-04): while an upload of the dataset page runs, the header shows the number of files
 * left and the total progress and opens the upload list; Pause/Resume and Cancel are there; a route change asks nothing
 * and a page unload warns while the upload is not settled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import PrimeVue from 'primevue/config';
import { nextTick } from 'vue';

const h = vi.hoisted(() => ({ held: [], deleted: [], listeners: {}, auth: null, session: true }));
vi.mock('@/libs/upload/uploadRequests', () => ({
    createUploadRequests: () => ({
        send: (job, hooks) => new Promise((resolve, reject) => {
            hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('Upload aborted'), { name: 'AbortError' })));
            h.held.push({ job, hooks, resolve });
        })
    })
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        url: 'http://hub.test', getAuthToken: () => 't', invalidateCache: () => {},
        // The client's session (the auth store follows it through the 'logout' event)
        isLoggedIn: () => h.session, getUsername: () => (h.session ? 'alice' : null), reportUnauthorized: () => {},
        addEventListener: (event, cb) => { (h.listeners[event] ??= new Set()).add(cb); },
        removeEventListener: (event, cb) => { h.listeners[event]?.delete(cb); },
        Organization: () => ({
            Dataset: () => ({ baseApi: '/orgs/o/ds/d', deleteChunkUpload: async id => { h.deleted.push(id); } })
        })
    }
}));
vi.mock('@/libs/notify', () => ({ notify: { success: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
// The signed-in user; signing out is the client's 'logout' event, which the auth store follows
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({ isLoggedIn: true });
    return { useAuthStore: () => h.auth };
});
const signOut = () => {
    h.session = false;
    h.auth.isLoggedIn = false;
    for (const cb of [...(h.listeners.logout ?? [])]) cb();
};

const { default: UploadIndicator } = await import('./UploadIndicator.vue');
const { useUploadsStore } = await import('@/stores/uploads');

const flush = async () => {
    for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 0));
        await nextTick();
    }
};
const files = (...names) => names.map(name => ({ file: { size: 100, name }, path: name }));

let wrapper, router, uploads;

async function render() {
    // The indicator sits in the header, which is rendered by a router view: its leave guard needs a route
    router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: { components: { UploadIndicator }, template: '<UploadIndicator />' } },
            { path: '/other', component: { template: '<p id="other">other page</p>' } },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: { template: '<p>dataset</p>' } }
        ]
    });
    await router.push('/');
    wrapper = mount({ components: { RouterView }, template: '<RouterView />' }, {
        attachTo: document.body,
        global: { plugins: [PrimeVue, router] }
    });
    await flushPromises();
}

const trigger = () => wrapper.find('.upload-indicator-button');

beforeEach(() => {
    h.held = [];
    h.deleted = [];
    h.listeners = {};
    h.session = true;
    if (h.auth) h.auth.isLoggedIn = true;
    setActivePinia(createPinia());
    uploads = useUploadsStore();
});
afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
});

describe('the indicator', () => {
    it('is not there when nothing uploads', async () => {
        await render();

        expect(trigger().exists()).toBe(false);
    });

    it('shows the files left and the whole-number total progress while an upload runs', async () => {
        await render();
        uploads.add('acme', 'site', [{ file: { size: 400, name: 'a' }, path: 'a' }, { file: { size: 600, name: 'b' }, path: 'b' }]);
        await flush();
        h.held[0].hooks.onProgress(h.held[0].job.items[0].id, 250);
        await new Promise(r => setTimeout(r, 300));
        await flush();

        expect(trigger().exists()).toBe(true);
        expect(trigger().find('.upload-left').text()).toBe('2');
        expect(trigger().find('.upload-percent').text()).toBe('25%');
        expect(trigger().attributes('aria-label')).toBe('Uploading: 2 files left, 25%. Show the upload list');
    });

    it('opens the upload list: a row for each dataset with its files left, progress and a link to it', async () => {
        await render();
        uploads.add('acme', 'site', files('a', 'b'));
        uploads.add('acme', 'other', files('c'));
        await flush();

        await trigger().trigger('click');
        await flush();

        const rows = [...document.body.querySelectorAll('.upload-row')];
        expect(rows.map(r => r.querySelector('.upload-row-name').textContent.trim())).toEqual(['acme/site', 'acme/other']);
        expect(rows[0].querySelector('.upload-row-state').textContent).toContain('2 files left, 0%');
        expect(rows[1].querySelector('.upload-row-state').textContent).toContain('1 file left, 0%');
    });

    it('Pause and Resume of a row act on that dataset', async () => {
        await render();
        uploads.add('acme', 'site', files('a'));
        await flush();
        await trigger().trigger('click');
        await flush();
        const pause = () => [...document.body.querySelectorAll('.upload-row-actions button')].find(b => /Pause|Resume/.test(b.textContent));

        pause().click();
        await flush();

        expect(uploads.paused).toBe(true);
        expect(pause().textContent).toContain('Resume');
        expect(trigger().find('i').classes()).toContain('fa-circle-pause');
        expect(trigger().attributes('aria-label')).toContain('Uploads paused');

        pause().click();
        await flush();
        expect(uploads.paused).toBe(false);
    });

    it('Cancel asks, naming how many files stay, and only a yes stops the upload', async () => {
        await render();
        uploads.add('acme', 'site', [{ file: { size: 10, name: 'a' }, path: 'a', fileId: 'chunked-id-0001' }, ...files('b')]);
        await flush();
        h.held[0].resolve(h.held[0].job.items.slice(0, 1).map(i => ({ id: i.id, ok: true, entry: { path: i.path } })));
        await new Promise(r => setTimeout(r, 300));
        await trigger().trigger('click');
        await flush();
        const cancel = () => [...document.body.querySelectorAll('.upload-row-actions button')].find(b => b.textContent.includes('Cancel'));

        cancel().click();
        await flush();
        expect(document.body.textContent).toContain('Stop the upload? The 1 file already sent stays in the dataset.');

        // Keep uploading
        document.body.querySelector('#confirmDialog [data-cancel]').click();
        await flush();
        expect(uploads.active).toBe(true);

        // The list closed with the click outside it: open it again
        if (!cancel()) {
            await trigger().trigger('click');
            await flush();
        }
        cancel().click();
        await flush();
        document.body.querySelector('#confirmDialog [data-confirm]').click();
        await flush();

        expect(uploads.active).toBe(false);
        expect(trigger().exists()).toBe(false);
    });
});

describe('signing out', () => {
    it('shows nothing once signed out, and Resume of the queue that was paused is gone with it', async () => {
        await render();
        uploads.add('acme', 'site', files('a'));
        await flush();
        uploads.pauseAll();
        await flush();
        expect(trigger().exists()).toBe(true);
        const requests = h.held.length;

        signOut();
        await flush();

        expect(trigger().exists()).toBe(false);
        expect(document.body.querySelector('.upload-row')).toBeNull();
        expect(uploads.uploads).toEqual([]);
        uploads.resumeAll();
        await flush();
        expect(h.held).toHaveLength(requests);
    });

    it('shows nothing while signed out, even with a queue (the store is the signed-in user\'s)', async () => {
        h.auth.isLoggedIn = false;
        await render();
        uploads.add('acme', 'site', files('a'));
        await flush();

        expect(uploads.active).toBe(true);
        expect(trigger().exists()).toBe(false);
    });
});

describe('leaving the page (FR-XC-04)', () => {
    it('a route change asks nothing: the upload goes on in the background', async () => {
        await render();
        uploads.add('acme', 'site', files('a'));
        await flush();

        await router.push('/other');
        await flush();

        expect(router.currentRoute.value.path).toBe('/other');
        expect(uploads.active).toBe(true);
        expect(h.held[0].hooks.signal.aborted).toBe(false);
        // No question is open
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('a page unload (reload, closed tab) warns while the upload is not settled, and only then', async () => {
        await render();
        const unload = () => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        };
        expect(unload()).toBe(false);

        uploads.add('acme', 'site', files('a'));
        await flush();
        expect(unload()).toBe(true);

        // Paused with files left is still unsaved work
        uploads.pauseAll();
        await flush();
        expect(unload()).toBe(true);

        h.held.at(-1);
        uploads.resumeAll();
        await flush();
        const last = h.held.at(-1);
        last.resolve(last.job.items.map(i => ({ id: i.id, ok: true, entry: { path: i.path } })));
        await flush();
        expect(uploads.active).toBe(false);
        expect(unload()).toBe(false);
    });
});
