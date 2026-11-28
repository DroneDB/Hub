/**
 * OrganizationsApi, the logo of an organization: the file goes as the multipart field `file` of PUT /orgs/{slug}/logo and
 * the removal is DELETE of the same address, each only for a signed-in user; a refusal of the Registry reaches the caller.
 */
import { describe, it, expect, vi } from 'vitest';
import OrganizationsApi, { ORG_LOGO_BYTES, orgLogoProblem } from './organizationsApi';
import { ApiError } from './apiError';

const api = (registry = {}) => {
    const reg = { ensureLoggedIn: () => true, ...registry };
    return new OrganizationsApi(/** @type {any} */ (reg));
};

describe('OrganizationsApi.uploadLogo', () => {
    it('puts the file as the field "file" and answers the new address', async () => {
        const putFormData = vi.fn(async () => ({ logoUrl: '/orgs/acme/logo?v=1' }));
        const file = new File(['x'], 'logo.png', { type: 'image/png' });
        expect(await api({ putFormData }).uploadLogo('acme', file)).toEqual({ logoUrl: '/orgs/acme/logo?v=1' });
        const [url, form] = putFormData.mock.calls[0];
        expect(url).toBe('/orgs/acme/logo');
        expect(form.get('file')).toBeInstanceOf(File);
    });

    it('escapes the slug in the address', async () => {
        const putFormData = vi.fn(async () => ({}));
        await api({ putFormData }).uploadLogo('a b', new File(['x'], 'l.png'));
        expect(putFormData.mock.calls[0][0]).toBe('/orgs/a%20b/logo');
    });

    it('lets a refusal through (403, 413, 400)', async () => {
        const putFormData = vi.fn(async () => { throw new ApiError('Too large', 413); });
        await expect(api({ putFormData }).uploadLogo('acme', new File(['x'], 'l.png'))).rejects.toMatchObject({ status: 413 });
    });

    it('sends nothing for a user who is not signed in', async () => {
        const putFormData = vi.fn();
        await expect(api({ putFormData, ensureLoggedIn: () => false }).uploadLogo('acme', new File(['x'], 'l.png'))).rejects.toThrow('not logged in');
        expect(putFormData).not.toHaveBeenCalled();
    });
});

describe('OrganizationsApi.deleteLogo', () => {
    it('deletes the logo of the organization', async () => {
        const deleteRequest = vi.fn(async () => undefined);
        await api({ deleteRequest }).deleteLogo('acme');
        expect(deleteRequest).toHaveBeenCalledWith('/orgs/acme/logo');
    });

    it('sends nothing for a user who is not signed in', async () => {
        const deleteRequest = vi.fn();
        await expect(api({ deleteRequest, ensureLoggedIn: () => false }).deleteLogo('acme')).rejects.toThrow('not logged in');
        expect(deleteRequest).not.toHaveBeenCalled();
    });
});

describe('orgLogoProblem', () => {
    it('allows 256 KB, where a report logo allows 512 KB', () => {
        expect(ORG_LOGO_BYTES).toBe(256 * 1024);
        expect(orgLogoProblem({ type: 'image/svg+xml', size: ORG_LOGO_BYTES })).toBeNull();
        expect(orgLogoProblem({ type: 'image/png', size: ORG_LOGO_BYTES + 1 })).toBe('The logo is at most 256 KB');
        expect(orgLogoProblem({ type: 'image/gif', size: 1 })).toMatch(/PNG, JPEG, WebP or SVG/);
    });
});
