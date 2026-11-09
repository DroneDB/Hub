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
