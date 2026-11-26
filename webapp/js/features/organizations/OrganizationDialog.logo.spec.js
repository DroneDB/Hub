/**
 * The logo in the Edit dialog of an organization: only in an edit, and only for whoever may change it; Upload and Replace
 * prepare the file in the browser (libs/logoImage, replaced here by a fake: its own spec tests it) and send the result at once,
 * and the toast says what was stored; Remove asks first; a file that cannot be a logo is refused at the field without a request,
 * and a refusal of the Registry shows there with its own message; the dialog says `logo-changed` with the new address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

const hoisted = vi.hoisted(() => ({
    reg: { orgs: { uploadLogo: null, deleteLogo: null } },
    prepareLogo: vi.fn(),
    notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: hoisted.reg }));
vi.mock('@/libs/notify', () => ({ notify: hoisted.notify }));
vi.mock('@/libs/logoImage', async importOriginal => ({ ...(await importOriginal()), prepareLogo: hoisted.prepareLogo }));

const { default: OrganizationDialog } = await import('./OrganizationDialog.vue');
const { LogoProblem } = await import('@/libs/logoImage');

let wrapper;
const model = { slug: 'acme', name: 'Acme', description: '', isPublic: false, logoUrl: null };

async function render(props = {}) {
    wrapper = mount(OrganizationDialog, {
        props: { mode: 'edit', model, save: vi.fn(), canManageLogo: true, ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
}

const body = () => document.body;
const buttonNamed = name => [...body().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent.trim() === name);
const logoError = () => body().querySelector('#organization-logo-error');
const confirmDialog = () => document.getElementById('confirmDialog');
const logoFile = (type = 'image/png') => new File(['x'], 'logo.png', { type });
const prepared = (extra = {}) => ({
    file: new File(['webp'], 'logo.webp', { type: 'image/webp' }), type: 'image/webp', width: 512, height: 160, bytes: 18 * 1024, kept: false, ...extra
});
async function choose(file) {
    const input = body().querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
}
async function click(element) {
    element.click();
    await flushPromises();
}

beforeEach(() => {
    hoisted.prepareLogo.mockReset().mockImplementation(async () => prepared());
    hoisted.reg.orgs.uploadLogo = vi.fn(async () => ({ logoUrl: '/orgs/acme/logo?v=2' }));
    hoisted.reg.orgs.deleteLogo = vi.fn(async () => undefined);
    Object.values(hoisted.notify).forEach(fn => fn.mockClear());
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('OrganizationDialog: who sees the logo', () => {
    it('shows it in an edit for whoever may change it', async () => {
        await render();
        expect(body().querySelector('#organization-logo-label').textContent).toBe('Logo');
        expect(buttonNamed('Upload logo')).toBeDefined();
    });

    it('does not show it to a user who may not change it', async () => {
        await render({ canManageLogo: false });
        expect(body().querySelector('#organization-logo-label')).toBeNull();
        expect(body().querySelector('input[type="file"]')).toBeNull();
    });

    it('does not show it in a new organization, which has no slug to give the logo to', async () => {
        await render({ mode: 'new', model: null });
        expect(body().querySelector('#organization-logo-label')).toBeNull();
    });
});

describe('OrganizationDialog: upload', () => {
    it('shows the initials without a logo, and Upload logo', async () => {
        await render();
        expect(body().querySelector('.org-logo-initials').textContent).toBe('A');
        expect(buttonNamed('Replace logo')).toBeUndefined();
        expect(buttonNamed('Remove logo')).toBeUndefined();
    });

    it('prepares the file, sends the result at once, shows the new logo, tells the page and the user what was stored', async () => {
        await render();
        const chosen = logoFile('image/jpeg');
        await choose(chosen);
        expect(hoisted.prepareLogo).toHaveBeenCalledWith(chosen, { maxBytes: 256 * 1024 });
        expect(hoisted.reg.orgs.uploadLogo).toHaveBeenCalledTimes(1);
        const [slug, file] = hoisted.reg.orgs.uploadLogo.mock.calls[0];
        expect(slug).toBe('acme');
        // What is sent is the logo made from the file, not the file
        expect(file).not.toBe(chosen);
        expect(file.name).toBe('logo.webp');
        expect(file.type).toBe('image/webp');
        expect(body().querySelector('img').getAttribute('src')).toBe('/orgs/acme/logo?v=2');
        expect(wrapper.emitted('logo-changed')).toEqual([['/orgs/acme/logo?v=2']]);
        expect(hoisted.notify.success).toHaveBeenCalledWith('Saved as WebP, 512 × 160, 18 KB', { summary: 'Logo saved' });
        expect(buttonNamed('Replace logo')).toBeDefined();
        expect(logoError()).toBeNull();
    });

    it('says what was stored for an SVG that stayed one', async () => {
        hoisted.prepareLogo.mockImplementation(async () => prepared({
            file: new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }), type: 'image/svg+xml', width: null, height: null, bytes: 3072, kept: true
        }));
        await render();
        await choose(logoFile('image/svg+xml'));
        expect(hoisted.reg.orgs.uploadLogo.mock.calls[0][1].name).toBe('logo.svg');
        expect(hoisted.notify.success).toHaveBeenCalledWith('Saved as SVG, 3 KB', { summary: 'Logo saved' });
    });

    it('accepts any image for the file chooser, and says what Hub does with it', async () => {
        await render();
        expect(body().querySelector('input[type="file"]').getAttribute('accept')).toBe('image/*');
        const hint = body().querySelector('.logo-field').textContent;
        expect(hint).toContain('PNG, JPEG, WebP, GIF, BMP, AVIF or SVG, up to 20 MB');
        expect(hint).toContain('shrinks a large image to 512 pixels and saves it as WebP');
        expect(hint).toContain('an SVG stays an SVG');
        expect(hint).toContain('at most 256 KB');
    });

    it('starts from the logo the organization has, and offers Replace and Remove', async () => {
        await render({ model: { ...model, logoUrl: '/orgs/acme/logo?v=1' } });
        expect(body().querySelector('img').getAttribute('src')).toBe('/orgs/acme/logo?v=1');
        expect(buttonNamed('Replace logo')).toBeDefined();
        expect(buttonNamed('Remove logo')).toBeDefined();
    });

    it('does not send a file that cannot be a logo, and says why at the field', async () => {
        hoisted.prepareLogo.mockRejectedValueOnce(new LogoProblem('The file is not an image Hub can read'));
        await render();
        await choose(logoFile('application/pdf'));
        expect(hoisted.reg.orgs.uploadLogo).not.toHaveBeenCalled();
        expect(logoError().textContent).toBe('The file is not an image Hub can read');
        hoisted.prepareLogo.mockRejectedValueOnce(new LogoProblem('The image does not fit in 256 KB, even much smaller: choose a simpler image'));
        await choose(logoFile());
        expect(logoError().textContent).toContain('does not fit in 256 KB');
        expect(wrapper.emitted('logo-changed')).toBeUndefined();
        expect(hoisted.notify.success).not.toHaveBeenCalled();
    });

    it('is busy while the file is prepared, and says so', async () => {
        let finish;
        hoisted.prepareLogo.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await render();
        await choose(logoFile());
        expect(buttonNamed('Upload logo').getAttribute('aria-disabled')).toBe('true');
        expect(body().querySelector('.logo-field [role="status"]').textContent).toContain('Preparing');
        expect(hoisted.reg.orgs.uploadLogo).not.toHaveBeenCalled();
        finish(prepared());
        await flushPromises();
        expect(body().querySelector('.logo-field [role="status"]')).toBeNull();
        expect(hoisted.reg.orgs.uploadLogo).toHaveBeenCalledTimes(1);
    });

    it('clears an earlier problem when the next file is chosen', async () => {
        hoisted.prepareLogo.mockRejectedValueOnce(new LogoProblem('The file is not an image Hub can read'));
        await render();
        await choose(logoFile('application/pdf'));
        expect(logoError()).not.toBeNull();
        await choose(logoFile());
        expect(logoError()).toBeNull();
    });

    it('shows the message of the Registry when it refuses the file, and keeps the logo it had', async () => {
        hoisted.reg.orgs.uploadLogo = vi.fn(async () => { throw new ApiError('The file is not an image', 400); });
        await render({ model: { ...model, logoUrl: '/orgs/acme/logo?v=1' } });
        await choose(logoFile());
        expect(logoError().textContent).toBe('The file is not an image');
        expect(body().querySelector('img').getAttribute('src')).toBe('/orgs/acme/logo?v=1');
        expect(wrapper.emitted('logo-changed')).toBeUndefined();
        expect(hoisted.notify.success).not.toHaveBeenCalled();
    });

    it('is busy while the file is sent: no second upload, no removal', async () => {
        let finish;
        hoisted.reg.orgs.uploadLogo = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        await render({ model: { ...model, logoUrl: '/orgs/acme/logo?v=1' } });
        await choose(logoFile());
        expect(buttonNamed('Replace logo').getAttribute('aria-disabled')).toBe('true');
        expect(buttonNamed('Remove logo').getAttribute('aria-disabled')).toBe('true');
        await click(buttonNamed('Replace logo'));
        expect(body().querySelector('input[type="file"]').value).toBe('');
        finish({ logoUrl: '/orgs/acme/logo?v=3' });
        await flushPromises();
        expect(buttonNamed('Replace logo').getAttribute('aria-disabled')).toBeNull();
    });
});

describe('OrganizationDialog: remove', () => {
    const withLogo = { ...model, logoUrl: '/orgs/acme/logo?v=1' };

    it('asks first, and sends nothing until the user confirms', async () => {
        await render({ model: withLogo });
        await click(buttonNamed('Remove logo'));
        expect(confirmDialog()).not.toBeNull();
        expect(confirmDialog().textContent).toContain('Acme');
        expect(hoisted.reg.orgs.deleteLogo).not.toHaveBeenCalled();
        await click(confirmDialog().querySelector('[data-cancel]'));
        expect(hoisted.reg.orgs.deleteLogo).not.toHaveBeenCalled();
        expect(body().querySelector('img')).not.toBeNull();
    });

    it('removes the logo once confirmed, shows the initials, tells the page and the user', async () => {
        await render({ model: withLogo });
        await click(buttonNamed('Remove logo'));
        await click(confirmDialog().querySelector('[data-confirm]'));
        expect(hoisted.reg.orgs.deleteLogo).toHaveBeenCalledWith('acme');
        expect(body().querySelector('img')).toBeNull();
        expect(body().querySelector('.org-logo-initials')).not.toBeNull();
        expect(wrapper.emitted('logo-changed')).toEqual([[null]]);
        expect(hoisted.notify.success).toHaveBeenCalledWith('Logo removed', { summary: 'Saved' });
        expect(buttonNamed('Remove logo')).toBeUndefined();
    });

    it('shows the refusal of the Registry at the field and keeps the logo', async () => {
        hoisted.reg.orgs.deleteLogo = vi.fn(async () => { throw new ApiError('Forbidden', 403); });
        await render({ model: withLogo });
        await click(buttonNamed('Remove logo'));
        await click(confirmDialog().querySelector('[data-confirm]'));
        expect(logoError().textContent).toBe('Forbidden');
        expect(body().querySelector('img')).not.toBeNull();
        expect(wrapper.emitted('logo-changed')).toBeUndefined();
    });
});
