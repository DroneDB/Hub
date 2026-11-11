import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TransferDialog from './TransferDialog.vue';

const { transferObj, writable, getOrganizations } = vi.hoisted(() => {
    const writable = { canRead: true, canWrite: true, canDelete: false, canManageMembers: false };
    return {
        transferObj: vi.fn(),
        writable,
        getOrganizations: vi.fn(async () => [{ org: { slug: 'dest', name: 'Dest', permissions: writable } }])
    };
});
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        orgs: { getOrganizations },
        Organization: () => ({ Dataset: () => ({ transferObj }), datasets: async () => [] })
    }
}));

const WindowStub = {
    props: ['title', 'confirmLabel', 'confirmIcon', 'confirmDisabled', 'busy'],
    emits: ['confirm', 'close'],
    template: '<div><h1 data-title>{{ title }}</h1><slot /><button data-confirm :data-icon="confirmIcon" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

const files = [{ entry: { path: 'a/one.jpg' } }, { entry: { path: 'two.jpg' } }];

async function open(props) {
    const w = mount(TransferDialog, {
        props: { files, sourceOrg: 'org', sourceDs: 'ds', ...props },
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
    await w.setData({ destOrg: 'dest', destDs: 'target', destPath: 'in' });
    return w;
}

describe('TransferDialog', () => {
    beforeEach(() => { transferObj.mockReset().mockResolvedValue(undefined); });

    it('moves the files by default: the server is told not to keep them', async () => {
        const w = await open({});
        expect(w.find('[data-title]').text()).toBe('Transfer to Dataset');
        expect(w.find('[data-confirm]').text()).toBe('Move to dataset');
        expect(w.find('[data-transfer-note]').text()).toMatch(/removed from this dataset/);
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(transferObj).toHaveBeenCalledTimes(2);
        expect(transferObj).toHaveBeenCalledWith('a/one.jpg', 'dest', 'target', 'in', false, false);
    });

    it('copies them when it keeps the source, and its texts say copy', async () => {
        const w = await open({ keepSource: true });
        expect(w.find('[data-title]').text()).toBe('Copy to Another Dataset');
        expect(w.find('[data-confirm]').text()).toBe('Copy to dataset');
        expect(w.find('[data-confirm]').attributes('data-icon')).toBe('fa-solid fa-copy');
        expect(w.find('[data-transfer-note]').text()).toMatch(/stay here/);
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(transferObj).toHaveBeenCalledWith('two.jpg', 'dest', 'target', 'in', false, true);
        expect(w.vm.statusMessage).toBe('Copy Complete');
    });

    it('says the copy failed when the server refuses it', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        transferObj.mockImplementation(async () => { throw new Error('Forbidden'); });
        const w = await open({ keepSource: true });
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(w.vm.errorMessage).toBe('Copy failed: Forbidden');
    });

    it('offers only the organizations the user may write: not the Public ones they can only read', async () => {
        const readOnly = { canRead: true, canWrite: false, canDelete: false, canManageMembers: false };
        getOrganizations.mockResolvedValueOnce([
            { org: { slug: 'mine', name: 'Mine', permissions: { ...writable, canDelete: true, canManageMembers: true } } },
            { org: { slug: 'team', name: 'Team', permissions: writable } },
            { org: { slug: 'open', name: 'Open', isPublic: true, permissions: readOnly } },
            { org: { slug: 'bare', name: 'Bare' } }
        ]);
        const w = await open({});
        expect(w.vm.organizationOptions).toEqual([
            { label: 'Mine', value: 'mine' },
            { label: 'Team', value: 'team' }
        ]);
    });

    it('starts in the current organization, with its datasets loaded (EXP-13)', async () => {
        const datasets = vi.fn(async () => [{ slug: 'ds', properties: {} }, { slug: 'other', properties: { meta: { name: { data: 'Other' } } } }]);
        getOrganizations.mockResolvedValueOnce([{ org: { slug: 'org', name: 'Org', permissions: writable } }, { org: { slug: 'dest', name: 'Dest', permissions: writable } }]);
        const spy = vi.spyOn(await import('@/libs/api/sharedRegistry').then(m => m.default), 'Organization')
            .mockImplementation(() => ({ Dataset: () => ({ transferObj }), datasets }));
        const w = mount(TransferDialog, {
            props: { files, sourceOrg: 'org', sourceDs: 'ds' },
            global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
        });
        await flushPromises();
        expect(w.vm.destOrg).toBe('org');
        expect(spy).toHaveBeenCalledWith('org');
        expect(w.vm.datasetOptions).toEqual([
            { label: 'ds', value: 'ds', disabled: true },
            { label: 'Other', value: 'other', disabled: false }
        ]);
        spy.mockRestore();
    });

    it('leaves the organization to choose when the user may not write the current one', async () => {
        const w = mount(TransferDialog, {
            props: { files, sourceOrg: 'org', sourceDs: 'ds', keepSource: true },
            global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
        });
        await flushPromises();
        expect(w.vm.destOrg).toBeNull();
        expect(w.vm.datasetOptions).toEqual([]);
    });

    it('picks the destination path with the folder picker of the destination dataset', async () => {
        const FolderPickerStub = { name: 'FolderPicker', props: ['dataset', 'mode', 'initialPath', 'title'], emits: ['close'], template: '<div data-picker />' };
        const w = mount(TransferDialog, {
            props: { files, sourceOrg: 'org', sourceDs: 'ds' },
            global: { plugins: [PrimeVue], stubs: { Window: WindowStub, FolderPicker: FolderPickerStub } }
        });
        await flushPromises();
        expect(w.find('[data-browse]').attributes('disabled')).toBeDefined();
        await w.setData({ destOrg: 'dest', destDs: 'target' });
        await w.find('[data-browse]').trigger('click');
        const picker = w.findComponent(FolderPickerStub);
        expect(picker.props('mode')).toBe('folder');
        expect(picker.props('dataset')).toBeTruthy();
        picker.vm.$emit('close', { path: 'images/2024', entry: null });
        await flushPromises();
        expect(w.vm.destPath).toBe('images/2024');
        expect(w.find('[data-picker]').exists()).toBe(false);
    });
});
