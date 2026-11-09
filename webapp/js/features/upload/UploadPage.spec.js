/**
 * UploadPage (FR-UPL-02, FR-UPL-01, D-009, D-047): a form for the organization, the name and the visibility (Private by
 * default) before the upload starts; Cancel, and leaving the page, roll the share batch back so that no half-filled
 * dataset stays; after the commit the router opens the dataset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

const mocks = vi.hoisted(() => ({
    reg: {
        url: 'http://reg.test',
        getUsername: vi.fn(() => 'alice'),
        getAuthToken: vi.fn(() => 'jwt'),
        orgs: { getOrganizations: vi.fn() },
        share: {
            init: vi.fn(),
            uploadUrl: vi.fn(token => `http://reg.test/share/upload/${token}`),
            commit: vi.fn(),
            rollback: vi.fn()
        }
    },
    notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    dropped: { files: [] },
    // The requests never end: the file stays in flight until the page cancels it
    send: vi.fn(() => new Promise(() => {}))
}));

vi.mock('@/libs/api/sharedRegistry', () => ({ default: mocks.reg }));
vi.mock('@/libs/notify', () => ({ notify: mocks.notify }));
vi.mock('@/libs/dragDropUtils', () => ({ getFilesFromDrop: vi.fn(async () => mocks.dropped.files) }));
vi.mock('@/libs/upload/uploadRequests', () => ({ createUploadRequests: vi.fn(() => ({ send: mocks.send })) }));

const { default: UploadPage } = await import('./UploadPage.vue');

const org = (slug, name, canWrite) => ({ org: { slug, name, permissions: { canWrite } } });
const file = (name, size = 10, extra = {}) => Object.assign(new File(['x'.repeat(size)], name), extra);

let wrapper;
let router;

function mountPage() {
    router = { push: vi.fn() };
    wrapper = mount(UploadPage, { global: { plugins: [PrimeVue], mocks: { $router: router } } });
    return wrapper;
}

async function drop(files) {
    mocks.dropped.files = files;
    await wrapper.find('.droparea').trigger('drop');
    await flushPromises();
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.reg.orgs.getOrganizations.mockResolvedValue([
        org('alice', 'alice', true), org('survey-team', 'Survey Team', false), org('drone-lab', 'Drone Lab', true)
    ]);
    mocks.reg.share.init.mockResolvedValue({ token: 'tok-1' });
    mocks.reg.share.rollback.mockResolvedValue(true);
    mocks.reg.share.commit.mockResolvedValue({ url: '/r/alice/brighton', tag: { organizationSlug: 'alice', datasetSlug: 'brighton' } });
});

afterEach(() => wrapper?.unmount());

async function started(files = [file('DJI_0025.JPG')]) {
    mountPage();
    await flushPromises();
    await drop(files);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
}

describe('UploadPage form', () => {
    it('lists only the organizations the user may write, and starts on the personal one', async () => {
        mountPage();
        await flushPromises();

        // The Public organization that the user can only read (Survey Team) is not a destination
        expect(wrapper.vm.organizationOptions).toEqual([
            { value: 'alice', label: 'alice' }, { value: 'drone-lab', label: 'Drone Lab' }
        ]);
        expect(wrapper.vm.orgSlug).toBe('alice');
    });

    it('says so when the user may write no organization', async () => {
        mocks.reg.orgs.getOrganizations.mockResolvedValue([org('survey-team', 'Survey Team', false)]);
        mountPage();
        await flushPromises();

        expect(wrapper.text()).toContain('you have no organization where you can add datasets');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    });

    it('starts as Private and offers Private, Unlisted and Public', async () => {
        mountPage();
        await flushPromises();

        expect(wrapper.vm.visibility).toBe(0);
        expect(wrapper.vm.visibilityOptions.map(o => o.label)).toEqual(['Private', 'Unlisted', 'Public']);
    });

    it('toggles the class of the drop zone on dragenter and dragleave', async () => {
        mountPage();
        await flushPromises();
        const zone = wrapper.find('.droparea');
        expect(zone.classes()).not.toContain('dragging');

        await zone.trigger('dragenter');
        expect(zone.classes()).toContain('dragging');

        await zone.trigger('dragleave');
        expect(zone.classes()).not.toContain('dragging');
    });

    it('keeps the highlight while the drag moves across children (enter, enter, leave)', async () => {
        mountPage();
        await flushPromises();
        const zone = wrapper.find('.droparea');

        await zone.trigger('dragenter');
        await zone.trigger('dragenter');
        await zone.trigger('dragleave');
        expect(zone.classes()).toContain('dragging');

        await zone.trigger('dragleave');
        expect(zone.classes()).not.toContain('dragging');
    });

    it('names the dataset after the first file, or the folder that holds it, until the user types a name', async () => {
        mountPage();
        await flushPromises();

        await drop([file('DJI_0025.JPG')]);
        expect(wrapper.find('#upload-dataset-name').element.value).toBe('DJI_0025');

        await wrapper.find('button[type="button"][class*="p-button-link"]').trigger('click');
        await drop([file('a.jpg', 10, { fullPath: 'Brighton Beach/day 1/a.jpg' })]);
        expect(wrapper.find('#upload-dataset-name').element.value).toBe('Brighton Beach');

        await wrapper.find('#upload-dataset-name').setValue('My survey');
        await wrapper.find('button[type="button"][class*="p-button-link"]').trigger('click');
        await drop([file('other.jpg')]);
        expect(wrapper.find('#upload-dataset-name').element.value).toBe('My survey');
    });

    it('does not start without a file', async () => {
        mountPage();
        await flushPromises();

        await wrapper.find('form').trigger('submit');

        expect(mocks.reg.share.init).not.toHaveBeenCalled();
    });
});

describe('UploadPage init', () => {
    it('sends the organization, the name and the visibility (Private by default) to share.init', async () => {
        await started([file('DJI_0025.JPG')]);

        expect(mocks.reg.share.init).toHaveBeenCalledTimes(1);
        expect(mocks.reg.share.init).toHaveBeenCalledWith({ orgSlug: 'alice', datasetName: 'DJI_0025', visibility: 0 });
    });

    it('sends what the user chose', async () => {
        mountPage();
        await flushPromises();
        await drop([file('a.txt')]);
        await wrapper.find('#upload-dataset-name').setValue('  Roof survey  ');
        wrapper.vm.orgSlug = 'drone-lab';
        wrapper.vm.visibility = 2;
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(mocks.reg.share.init).toHaveBeenCalledWith({ orgSlug: 'drone-lab', datasetName: 'Roof survey', visibility: 2 });
    });

    it('sends each file to the batch with its path (the structure of a dropped folder is kept)', async () => {
        await started([file('a.jpg', 10, { fullPath: 'Field/a.jpg' }), file('b.txt')]);

        expect(mocks.send).toHaveBeenCalled();
        const job = mocks.send.mock.calls[0][0];
        expect(job.items[0].path).toBe('Field/a.jpg');
    });

    it('shows a refused name at the Dataset name field, from errors.datasetName, not as a message', async () => {
        mocks.reg.share.init.mockRejectedValue(new ApiError('One or more validation errors occurred.', 400,
            { errors: { datasetName: ['Use at least one Latin letter (a–z) or digit'] } }));
        await started([file('a.jpg')]);

        const error = wrapper.find('#upload-dataset-name-error');
        expect(error.text()).toBe('Use at least one Latin letter (a–z) or digit');
        expect(wrapper.find('#upload-dataset-name').attributes('aria-describedby')).toBe('upload-dataset-name-error');
        expect(wrapper.find('.error-msg').exists()).toBe(false);
        expect(mocks.notify.error).not.toHaveBeenCalled();
        // Still the form: nothing started
        expect(wrapper.find('form').exists()).toBe(true);
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it('checks the Latin letter rule before the request', async () => {
        mountPage();
        await flushPromises();
        await drop([file('a.jpg')]);
        await wrapper.find('#upload-dataset-name').setValue('!!!');
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(wrapper.find('#upload-dataset-name-error').text()).toBe('Use at least one Latin letter (a–z) or digit');
        expect(mocks.reg.share.init).not.toHaveBeenCalled();
    });

    it('shows another failure as a message', async () => {
        mocks.reg.share.init.mockRejectedValue(new ApiError('Server Error', 500));
        await started([file('a.jpg')]);

        expect(wrapper.find('.error-msg').text()).toContain('Cannot initialize upload: Server Error');
    });
});

describe('UploadPage cancel (FR-UPL-01)', () => {
    it('rolls the batch back with its token, then says "Upload cancelled" and shows the form again', async () => {
        await started();
        expect(wrapper.find('form').exists()).toBe(false);

        await wrapper.find('button[class*="p-button-danger"]').trigger('click');
        await flushPromises();

        expect(mocks.reg.share.rollback).toHaveBeenCalledTimes(1);
        expect(mocks.reg.share.rollback).toHaveBeenCalledWith('tok-1');
        expect(mocks.notify.info).toHaveBeenCalledWith('Upload cancelled');
        expect(mocks.reg.share.commit).not.toHaveBeenCalled();
        expect(wrapper.vm.uploadToken).toBeNull();
        expect(wrapper.find('form').exists()).toBe(true);
    });

    it('says so when the Registry could not discard the batch (it removes it after 24 hours)', async () => {
        mocks.reg.share.rollback.mockRejectedValue(new ApiError('Server Error', 500));
        await started();

        await wrapper.find('button[class*="p-button-danger"]').trigger('click');
        await flushPromises();

        expect(mocks.notify.info).not.toHaveBeenCalled();
        expect(mocks.notify.warn).toHaveBeenCalledWith(expect.stringContaining('24 hours'), { summary: 'Upload cancelled' });
        expect(wrapper.find('form').exists()).toBe(true);
    });

    it('rolls the batch back when the page is left while an upload runs', async () => {
        await started();

        wrapper.unmount();
        await flushPromises();

        expect(mocks.reg.share.rollback).toHaveBeenCalledWith('tok-1');
        wrapper = null;
    });

    it('rolls back the batch, and sends nothing, when the page is left while share.init is in flight', async () => {
        let resolveInit;
        mocks.reg.share.init.mockReturnValue(new Promise(resolve => { resolveInit = resolve; }));
        mountPage();
        await flushPromises();
        await drop([file('DJI_0025.JPG')]);
        await wrapper.find('form').trigger('submit');
        await flushPromises();
        expect(mocks.reg.share.init).toHaveBeenCalledTimes(1);

        wrapper.unmount();
        await flushPromises();
        expect(mocks.reg.share.rollback).not.toHaveBeenCalled();

        resolveInit({ token: 'tok-late' });
        await flushPromises();

        expect(mocks.reg.share.rollback).toHaveBeenCalledTimes(1);
        expect(mocks.reg.share.rollback).toHaveBeenCalledWith('tok-late');
        expect(mocks.send).not.toHaveBeenCalled();
        wrapper = null;
    });

    it('does not call the Registry when the page is left before an upload started', async () => {
        mountPage();
        await flushPromises();

        wrapper.unmount();
        await flushPromises();

        expect(mocks.reg.share.rollback).not.toHaveBeenCalled();
        wrapper = null;
    });

    it('does not roll back a batch whose commit is in flight', async () => {
        await started();
        wrapper.vm.committing = true;

        wrapper.unmount();
        await flushPromises();

        expect(mocks.reg.share.rollback).not.toHaveBeenCalled();
        wrapper = null;
    });
});

describe('UploadPage commit', () => {
    it('opens the dataset with the router (not location.href) and says so', async () => {
        await started();
        const hrefBefore = location.href;

        await wrapper.vm.onIdle({ items: [{ status: 'done', name: 'DJI_0025.JPG' }] });
        await flushPromises();

        expect(mocks.reg.share.commit).toHaveBeenCalledWith('tok-1');
        expect(router.push).toHaveBeenCalledWith({ name: 'ViewDataset', params: { org: 'alice', ds: 'brighton' } });
        expect(mocks.notify.success).toHaveBeenCalledTimes(1);
        expect(mocks.notify.success.mock.calls[0][1]).toEqual({ summary: 'Upload complete' });
        expect(location.href).toBe(hrefBefore);
    });

    it('does not commit while a cancel is rolling the batch back', async () => {
        await started();
        wrapper.vm.cancelling = true;

        await wrapper.vm.onIdle({ items: [{ status: 'done', name: 'a' }] });

        expect(mocks.reg.share.commit).not.toHaveBeenCalled();
    });

    it('does not commit when a file failed: it offers Retry failed and Cancel', async () => {
        await started();

        await wrapper.vm.onIdle({ items: [{ status: 'error', name: 'a.jpg', errorMessage: 'boom' }] });
        await flushPromises();

        expect(mocks.reg.share.commit).not.toHaveBeenCalled();
        expect(wrapper.find('.error-msg').text()).toContain('Failed to upload a.jpg: boom');
    });
});
