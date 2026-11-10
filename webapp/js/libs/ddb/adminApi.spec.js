/**
 * adminTasks (FR-PRC-28): the filters, the page and the order go to GET /sys/tasks as query keys; no order
 * is asked for unless the caller gives one.
 */
import { describe, it, expect, vi } from 'vitest';
import AdminApi from './adminApi';

const api = () => {
    const getRequest = vi.fn(() => Promise.resolve({ items: [], total: 0 }));
    return { admin: new AdminApi(/** @type {any} */ ({ getRequest })), getRequest };
};

describe('AdminApi.adminTasks', () => {
    it('sends the filters, the page and the order', async () => {
        const { admin, getRequest } = api();
        await admin.adminTasks({ toolId: 'zip', state: 'Failed', userId: 'u1', skip: 20, take: 25, sortField: 'state', sortOrder: 'asc' });
        expect(getRequest).toHaveBeenCalledWith('/sys/tasks?toolId=zip&state=Failed&userId=u1&skip=20&take=25&sortField=state&sortOrder=asc');
    });

    it('sends no order when none is given, and no empty filter', async () => {
        const { admin, getRequest } = api();
        await admin.adminTasks({ toolId: '', skip: 0, take: 10 });
        expect(getRequest).toHaveBeenCalledWith('/sys/tasks?skip=0&take=10');
    });
});

describe('AdminApi.updateUser (FR-ADM-07)', () => {
    const put = () => {
        const putRequest = vi.fn(() => Promise.resolve(true));
        return { admin: new AdminApi(/** @type {any} */ ({ putRequest })), putRequest };
    };

    it('leaves the e-mail out of the body when it is undefined, so the Registry keeps it', async () => {
        const { admin, putRequest } = put();
        await admin.updateUser('bob', undefined, ['editor']);
        expect(putRequest).toHaveBeenCalledWith('/users/bob', { roles: ['editor'] });
        expect(Object.keys(putRequest.mock.calls[0][1])).toEqual(['roles']);
    });

    it('sends an e-mail that is given, an empty one too (it removes the address)', async () => {
        const { admin, putRequest } = put();
        await admin.updateUser('bob', 'bob@example.com', ['editor']);
        await admin.updateUser('bob', '', []);
        expect(putRequest).toHaveBeenNthCalledWith(1, '/users/bob', { roles: ['editor'], email: 'bob@example.com' });
        expect(putRequest).toHaveBeenNthCalledWith(2, '/users/bob', { roles: [], email: '' });
    });
});

describe('AdminApi.setUserQuota (FR-ADM-16)', () => {
    const post = () => {
        const postRequest = vi.fn(() => Promise.resolve({}));
        return { admin: new AdminApi(/** @type {any} */ ({ postRequest })), postRequest };
    };

    it('sends only the quota key of the metadata, in MB', async () => {
        const { admin, postRequest } = post();
        await admin.setUserQuota('bob smith', 40);
        expect(postRequest).toHaveBeenCalledWith('/users/bob%20smith/meta', { maxStorageMB: 40 });
        expect(Object.keys(postRequest.mock.calls[0][1])).toEqual(['maxStorageMB']);
    });

    it('sends null to remove the quota (an empty value, or none)', async () => {
        const { admin, postRequest } = post();
        await admin.setUserQuota('bob', null);
        await admin.setUserQuota('bob', undefined);
        expect(postRequest).toHaveBeenNthCalledWith(1, '/users/bob/meta', { maxStorageMB: null });
        expect(postRequest).toHaveBeenNthCalledWith(2, '/users/bob/meta', { maxStorageMB: null });
    });
});
