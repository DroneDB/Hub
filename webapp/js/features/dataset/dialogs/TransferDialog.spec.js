import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TransferDialog from './TransferDialog.vue';

const transferObj = vi.fn();
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        orgs: { getOrganizations: vi.fn(async () => [{ org: { slug: 'dest', name: 'Dest' } }]) },
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
        expect(w.find('[data-confirm]').text()).toBe('Transfer');
        expect(w.find('[data-transfer-note]').text()).toMatch(/removed from this dataset/);
        await w.find('[data-confirm]').trigger('click');
        await flushPromises();
        expect(transferObj).toHaveBeenCalledTimes(2);
        expect(transferObj).toHaveBeenCalledWith('a/one.jpg', 'dest', 'target', 'in', false, false);
    });

    it('copies them when it keeps the source, and its texts say copy', async () => {
        const w = await open({ keepSource: true });
        expect(w.find('[data-title]').text()).toBe('Copy to Another Dataset');
        expect(w.find('[data-confirm]').text()).toBe('Copy');
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
});
