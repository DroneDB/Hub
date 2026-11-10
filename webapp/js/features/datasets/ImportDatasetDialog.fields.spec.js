/**
 * The Registry URL field and the Import step of the Import dialog (FR-UPL-14, -17, -18, -19, -20, -21): a typed link counts
 * as an applied one, a stale error goes with the values it was about, a refused Import shows its reason next to the Import
 * button and not next to "Source reachable", and a second import of a dataset gets a different name.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: ImportDatasetDialog } = await import('./ImportDatasetDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
});

const REACHABLE = { reachable: true, fileCount: 3, estimatedBytes: 3000, suggestedName: 'aukerman', suggestedSlug: 'aukerman' };

async function render({ org = {}, forbiddenSlugs = [] } = {}) {
    const api = {
        importSources: () => Promise.resolve(['registry']),
        verifyImport: vi.fn(async () => REACHABLE),
        createImport: vi.fn(async () => ({ taskId: 't1', dsSlug: 'aukerman' })),
        browseImport: vi.fn(async () => ({ items: [] })),
        Dataset: vi.fn(() => ({})),
        ...org
    };
    reg.Organization = vi.fn(() => api);
    wrapper = mount(ImportDatasetDialog, {
        props: { orgSlug: 'acme', forbiddenSlugs },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return api;
}

// The window is teleported out of the wrapper: its parts are read in the document
const byId = id => document.getElementById(id);
const urlField = () => byId('import-dataset-dialog-registry-url');
const buttonOf = label => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
const isDisabled = button => button.hasAttribute('disabled');
const fire = async (el, type) => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
    await flushPromises();
};
const typeInto = async (el, value) => {
    el.value = value;
    await fire(el, 'input');
};
const type = value => typeInto(urlField(), value);
const click = async button => {
    button.click();
    await flushPromises();
};
const text = () => document.body.textContent;

describe('ImportDatasetDialog, verify state (FR-UPL-17)', () => {
    it('editing the Registry URL removes the old error with the values it was about', async () => {
        const api = await render({ org: { verifyImport: vi.fn(async () => ({ reachable: false, note: 'The source is not reachable.' })) } });
        await type('https://example.com/r/admin/brighton-beach');
        await wrapper.vm.verify();
        await flushPromises();
        expect(text()).toContain('The source is not reachable.');
        expect(api.verifyImport).toHaveBeenCalledTimes(1);

        await type('https://example.com/r/admin/brighton-beach2');

        expect(text()).not.toContain('The source is not reachable.');
        expect(wrapper.vm.verifyError).toBeNull();
        expect(wrapper.vm.verifyResult).toBeNull();
    });

    it('resetVerify clears the error and the result together', async () => {
        await render();
        wrapper.vm.verifyError = 'old';
        wrapper.vm.verifyResult = { reachable: true };

        wrapper.vm.resetVerify();

        expect([wrapper.vm.verifyError, wrapper.vm.verifyResult]).toEqual([null, null]);
    });
});

describe('ImportDatasetDialog, a tag without a host (FR-UPL-18)', () => {
    it('"org/dataset" fills the fields from the default registry', async () => {
        await render();
        await type('admin/brighton-beach');
        await fire(urlField(), 'change');

        expect(wrapper.vm.params).toMatchObject({ url: 'https://hub.dronedb.app', organization: 'admin', dataset: 'brighton-beach' });
    });

    it('says what to add for "a/b/c", and not for a good link', async () => {
        await render();
        await type('a/b/c');
        expect(text()).toContain('Add the registry address, e.g. hub.dronedb.app/admin/brighton-beach');

        await type('admin/brighton-beach');
        expect(text()).not.toContain('Add the registry address');
    });

    it('has the default registry as its placeholder', async () => {
        await render();
        expect(urlField().getAttribute('placeholder')).toBe('https://hub.dronedb.app');
    });
});

describe('ImportDatasetDialog, a typed link (FR-UPL-20)', () => {
    it('enables Verify and Browse datasets while the link is only typed, and Verify applies it', async () => {
        const api = await render();
        expect(isDisabled(buttonOf('Verify'))).toBe(true);
        expect(isDisabled(buttonOf('Browse datasets'))).toBe(true);

        await type('https://hub.dronedb.app/r/odm/brighton-beach');

        expect(isDisabled(buttonOf('Verify'))).toBe(false);
        expect(isDisabled(buttonOf('Browse datasets'))).toBe(false);

        await click(buttonOf('Verify'));
        expect(api.verifyImport).toHaveBeenCalledWith('registry', expect.objectContaining({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'brighton-beach'
        }));
    });

    it('an organization link enables Browse datasets but not Verify', async () => {
        await render();
        await type('https://hub.dronedb.app/r/odm');
        expect(isDisabled(buttonOf('Browse datasets'))).toBe(false);
        expect(isDisabled(buttonOf('Verify'))).toBe(true);
    });
});

describe('ImportDatasetDialog, a refused Import (FR-UPL-19)', () => {
    it('shows the reason next to the Import button and not "Source reachable"', async () => {
        const reason = 'This server cannot import from local or private network addresses (localhost). Use the public address of the registry.';
        await render({ org: { createImport: vi.fn(async () => { throw new Error(reason); }) } });
        await type('https://hub.dronedb.app/r/odm/aukerman');
        await click(buttonOf('Verify'));
        expect(text()).toContain('Source reachable');

        await wrapper.vm.startImport();
        await flushPromises();

        const error = document.querySelector('#import-dataset-dialog-import-error');
        expect(error.textContent).toBe(reason);
        expect(error.getAttribute('role')).toBe('alert');
        expect(text()).not.toContain('Source reachable');
        expect(wrapper.vm.verifyError).toBeNull();
    });

    it('the reason goes when the link is edited', async () => {
        await render({ org: { createImport: vi.fn(async () => { throw new Error('refused'); }) } });
        await type('https://hub.dronedb.app/r/odm/aukerman');
        await click(buttonOf('Verify'));
        await wrapper.vm.startImport();
        await flushPromises();
        expect(document.querySelector('#import-dataset-dialog-import-error')).not.toBeNull();

        await type('https://hub.dronedb.app/r/odm/aukerman2');
        expect(document.querySelector('#import-dataset-dialog-import-error')).toBeNull();
    });
});

describe('ImportDatasetDialog, the name of a second import (FR-UPL-14)', () => {
    it('suggests the remote name and slug at first', async () => {
        await render({ org: { verifyImport: vi.fn(async () => ({ ...REACHABLE, suggestedName: 'Aukerman Mine' })) } });
        await type('https://hub.dronedb.app/r/odm/aukerman');
        await click(buttonOf('Verify'));

        expect([wrapper.vm.name, wrapper.vm.slug]).toEqual(['Aukerman Mine', 'aukerman']);
    });

    it('suggests "aukerman (2)" and "aukerman-2" when the slug exists in the organization', async () => {
        await render({ forbiddenSlugs: ['aukerman'] });
        await type('https://hub.dronedb.app/r/odm/aukerman');
        await click(buttonOf('Verify'));

        expect([wrapper.vm.name, wrapper.vm.slug]).toEqual(['aukerman (2)', 'aukerman-2']);
        expect(byId('import-dataset-dialog-dataset-name').value).toBe('aukerman (2)');
        expect(byId('import-dataset-dialog-slug').value).toBe('aukerman-2');
    });

    it('a name the user types still makes its slug', async () => {
        await render();
        await type('https://hub.dronedb.app/r/odm/aukerman');
        await click(buttonOf('Verify'));

        await typeInto(byId('import-dataset-dialog-dataset-name'), 'Other Name');

        expect(wrapper.vm.slug).toBe('other-name');
    });
});

describe('ImportDatasetDialog, the time left (FR-UPL-21)', () => {
    it('follows the speed of the last seconds, not the average since the start', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        await render();
        const { startImport, onImportProgress } = ImportDatasetDialog.methods;
        const vm = {
            canImport: true, sourceType: 'registry', params: {}, slug: 's', name: 'n', visibility: 0,
            submitting: false, importing: false, taskId: null, importStartTime: 0,
            progressPercent: 0, phase: null, logTail: [], etaText: '',
            org: { createImport: vi.fn(async () => ({ taskId: 't1', dsSlug: 's' })), Dataset: vi.fn(() => ({})) },
            trackHeavyTask: vi.fn(() => new Promise(() => {})),
            $emit: vi.fn()
        };
        vm.onImportProgress = onImportProgress.bind(vm);
        void startImport.call(vm);
        await vi.advanceTimersByTimeAsync(0);

        // Slow for a minute (6 %), then 1 % a second: 64 % left at 36 %
        vi.setSystemTime(60_000);
        vm.onImportProgress({ percent: 6, phase: 'downloading' });
        vi.setSystemTime(90_000);
        vm.onImportProgress({ percent: 36, phase: 'downloading' });

        expect(vm.etaText).toBe('1m 4s');
        vm.onImportProgress({ percent: 100, phase: 'done' });
        expect(vm.etaText).toBe('');
    });
});
