/** The share API (§7.1, FR-UPL-02, FR-UPL-01): init carries the form fields, rollback has its endpoint. */
import { describe, it, expect, vi } from 'vitest';
import ShareApi from './shareApi';

function setup() {
    const registry = {
        url: 'http://reg.test',
        postFormData: vi.fn(async () => ({ token: 't1' })),
        makeRequest: vi.fn(async () => true)
    };
    return { registry, share: new ShareApi(/** @type {any} */ (registry)) };
}

const fieldsOf = form => Object.fromEntries(form.entries());

describe('ShareApi.init', () => {
    it('posts OrgSlug, DatasetName and Visibility as the form of share/init', async () => {
        const { registry, share } = setup();

        const result = await share.init({ orgSlug: 'survey-team', datasetName: 'Brighton Beach', visibility: 0 });

        expect(result).toEqual({ token: 't1' });
        expect(registry.postFormData).toHaveBeenCalledTimes(1);
        const [endpoint, form] = registry.postFormData.mock.calls[0];
        expect(endpoint).toBe('/share/init');
        expect(fieldsOf(form)).toEqual({ OrgSlug: 'survey-team', DatasetName: 'Brighton Beach', Visibility: '0' });
    });

    it('sends Visibility 2 for Public and leaves out a field it was not given', async () => {
        const { registry, share } = setup();

        await share.init({ orgSlug: 'o', visibility: 2 });

        expect(fieldsOf(registry.postFormData.mock.calls[0][1])).toEqual({ OrgSlug: 'o', Visibility: '2' });
    });
});

describe('ShareApi.rollback', () => {
    it('posts to /share/rollback/{token} with the token escaped', async () => {
        const { registry, share } = setup();

        await share.rollback('a/b c');

        expect(registry.makeRequest).toHaveBeenCalledWith('/share/rollback/a%2Fb%20c', 'POST');
    });
});
