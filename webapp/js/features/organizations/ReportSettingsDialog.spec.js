/**
 * The report settings dialog of an organization: read-only for a member and editable for an administrator, the
 * version of the Registry's settings (a logo answers with a new one, which the next save sends; a stale one is a 409
 * that asks to reload), the logo of the organization or a custom one (prepared in the browser, only for a template
 * that is saved), the schema keeping its last category and status,
 * and the Registry's refusals shown at the fields.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import { ApiError } from '@/libs/ddb/apiError';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE, cloneSettings } from '@/libs/reports/reportSettings';

const hoisted = vi.hoisted(() => ({
    reg: { Organization: null }, notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }, prepareLogoFor: vi.fn()
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: hoisted.reg }));
vi.mock('@/libs/notify', () => ({ notify: hoisted.notify }));
// The browser's part of preparing a logo is libs/logoImage's own spec: here the logo made from a file is a WebP
vi.mock('@/libs/logoImage', async importOriginal => ({ ...(await importOriginal()), prepareLogoFor: hoisted.prepareLogoFor }));
const { LogoProblem } = await import('@/libs/logoImage');
const preparedLogo = () => ({
    file: new File(['webp'], 'logo.webp', { type: 'image/webp' }), type: 'image/webp', width: 512, height: 288, bytes: 61 * 1024, kept: false
});

const { default: ReportSettingsDialog } = await import('./ReportSettingsDialog.vue');

// The Registry, as far as the dialog meets it: one stored version of the settings, and its refusals
let server;
let registry;
let wrapper;

function makeRegistry() {
    return {
        getRequest: vi.fn(async () => cloneSettings(server)),
        putRequest: vi.fn(async (url, body) => {
            if (body.version !== server.version) throw new ApiError('Conflict', 409);
            server = { templates: cloneSettings(body.templates), schema: cloneSettings(body.schema), version: server.version + 1 };
            return cloneSettings(server);
        }),
        putFormData: vi.fn(async url => {
            const id = /templates\/([^/]+)\/logo/.exec(url)[1];
            if (!server.templates.some(t => t.id === id)) throw new ApiError('No such template', 404);
            server.templates.find(t => t.id === id).logo = 'report-logo.png';
            server.version += 1;
            return { logo: 'report-logo.png', version: server.version };
        }),
        deleteRequest: vi.fn(async url => {
            const id = /templates\/([^/]+)\/logo/.exec(url)[1];
            server.templates.find(t => t.id === id).logo = null;
            server.version += 1;
            return { version: server.version };
        })
    };
}

async function render(props = {}) {
    wrapper = mount(ReportSettingsDialog, {
        props: { orgSlug: 'acme', canEdit: true, ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
}

const body = () => document.body;
const byText = (selector, text) => [...body().querySelectorAll(selector)].find(el => el.textContent.trim() === text);
const buttonNamed = name => [...body().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent.trim() === name);
const saveButton = () => body().querySelector('button[data-confirm]');
const field = id => document.getElementById(id);
async function type(id, value) {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}
async function click(element) {
    element.click();
    await flushPromises();
}
const tab = name => byText('[role="tab"]', name) ?? [...body().querySelectorAll('[role="tab"]')].find(t => t.textContent.includes(name));
const save = () => click(saveButton());
const confirmDialog = () => document.getElementById('confirmDialog');
const sentTemplates = () => registry.putRequest.mock.calls.at(-1)[1].templates;

beforeEach(() => {
    server = { templates: [{ ...cloneSettings(DEFAULT_TEMPLATE) }], schema: cloneSettings(DEFAULT_SCHEMA), version: 3 };
    registry = makeRegistry();
    hoisted.reg.Organization = slug => ({ registry, org: slug });
    Object.values(hoisted.notify).forEach(fn => fn.mockClear());
    hoisted.prepareLogoFor.mockReset().mockImplementation(async () => preparedLogo());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('ReportSettingsDialog: loading', () => {
    it('reads the settings of the organization and shows the template', async () => {
        await render();
        expect(registry.getRequest).toHaveBeenCalledWith('/orgs/acme/report-settings', { cache: false });
        expect(field('report-template-name').value).toBe('Standard');
        expect(body().querySelector('[data-test="preview-page"]')).not.toBeNull();
    });

    it('says why the settings did not load and reads them again on Retry', async () => {
        registry.getRequest.mockRejectedValueOnce(new ApiError('Forbidden', 403));
        await render();
        expect(body().textContent).toContain('Forbidden');
        expect(field('report-template-name')).toBeNull();
        await click(buttonNamed('Retry'));
        expect(field('report-template-name').value).toBe('Standard');
    });
});

describe('ReportSettingsDialog: a member who is not an administrator', () => {
    it('sees every field disabled, no Save, no Add or Delete, and a note', async () => {
        await render({ canEdit: false });
        expect(body().querySelector('[data-test="read-only-note"]')).not.toBeNull();
        expect(saveButton()).toBeNull();
        expect(buttonNamed('Add template')).toBeUndefined();
        expect(buttonNamed('Delete template')).toBeUndefined();
        expect(buttonNamed('Upload logo')).toBeUndefined();
        const controls = [...body().querySelectorAll('.report-settings input, .report-settings textarea')].filter(el => el.type !== 'hidden' && el.type !== 'file');
        expect(controls.length).toBeGreaterThan(5);
        expect(controls.filter(el => !el.disabled).map(el => el.id || el.getAttribute('aria-label'))).toEqual([]);
        // Every list is disabled but the picker of the template to look at: a member reads each of them
        const selects = wrapper.findAllComponents(Select).filter(s => s.props('inputId') !== 'report-template-picker');
        expect(selects.length).toBeGreaterThan(1);
        expect(selects.every(s => s.props('disabled'))).toBe(true);
        // The schema too
        expect(buttonNamed('Add category')).toBeUndefined();
        expect(body().querySelector('[data-test="schema-categories"] button')).toBeNull();
        expect(body().querySelector('[data-test="schema-categories"] input[type="color"]').disabled).toBe(true);
    });

    it('closes at once with Close, with nothing to discard', async () => {
        await render({ canEdit: false });
        await click(buttonNamed('Close'));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});

describe('ReportSettingsDialog: saving', () => {
    it('sends the templates, the schema and the version, then sends the version it got back', async () => {
        await render();
        await type('report-template-header', 'Acme Quarries');
        await save();
        expect(registry.putRequest).toHaveBeenCalledTimes(1);
        expect(registry.putRequest.mock.calls[0][0]).toBe('/orgs/acme/report-settings');
        expect(registry.putRequest.mock.calls[0][1]).toMatchObject({ version: 3, templates: [{ id: 'standard', headerText: 'Acme Quarries' }] });
        expect(hoisted.notify.success).toHaveBeenCalled();
        // The dialog stays open, on the version the Registry answered with
        await type('report-template-footer', 'Page footer');
        await save();
        expect(registry.putRequest.mock.calls[1][1].version).toBe(4);
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('sends nothing for a name that is empty, and shows it at the field with the focus there', async () => {
        await render();
        await type('report-template-name', '  ');
        await save();
        expect(registry.putRequest).not.toHaveBeenCalled();
        expect(body().querySelector('#report-template-name-error').textContent).toBe('Enter a name');
        expect(field('report-template-name').getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(field('report-template-name'));
        expect(field('report-template-name').getAttribute('aria-describedby')).toContain('report-template-name-error');
        expect(body().querySelector('[data-test="form-error"]').textContent).toContain('Fix the problem marked below');
    });

    it('trims the names it sends', async () => {
        await render();
        await type('report-template-name', '  Audit  ');
        await save();
        expect(sentTemplates()[0].name).toBe('Audit');
    });
});

describe('ReportSettingsDialog: summary charts', () => {
    const chartSelect = () => wrapper.findAllComponents(Select).find(c => c.props('inputId') === 'report-template-breakdown');

    it('shows a template stored before the choice existed as Bars, and sends bars', async () => {
        for (const stored of server.templates) delete stored.breakdownChart;
        await render();
        expect(chartSelect().props('modelValue')).toBe('bars');
        await type('report-template-header', 'Acme');
        await save();
        expect(sentTemplates()[0].breakdownChart).toBe('bars');
    });

    it('sends Donuts once chosen, and shows it when the dialog reads the settings again', async () => {
        await render();
        expect(chartSelect().props('options').map(o => o.label)).toEqual(['Bars', 'Donuts']);
        chartSelect().vm.$emit('update:modelValue', 'donuts');
        await flushPromises();
        await save();
        expect(sentTemplates()[0].breakdownChart).toBe('donuts');
        wrapper.unmount();
        await render();
        expect(chartSelect().props('modelValue')).toBe('donuts');
    });

    it('is read-only for a member', async () => {
        await render({ canEdit: false });
        expect(chartSelect().props('disabled')).toBe(true);
    });
});

describe('ReportSettingsDialog: templates', () => {
    async function addTemplate(name) {
        await click(buttonNamed('Add template'));
        await type('report-template-name', name);
    }

    it('a new template has an id made from its name, until it is saved; then the id stays', async () => {
        await render();
        await addTemplate('Safety audit');
        expect(body().textContent).toContain('safety-audit');
        await type('report-template-name', 'Safety audit 2');
        expect(body().textContent).toContain('safety-audit-2');
        await save();
        expect(sentTemplates().map(t => t.id)).toEqual(['standard', 'safety-audit-2']);
        await type('report-template-name', 'Renamed after save');
        await save();
        expect(sentTemplates().map(t => [t.id, t.name])).toEqual([['standard', 'Standard'], ['safety-audit-2', 'Renamed after save']]);
    });

    it('cannot delete the last template, and a deleted one goes when saved', async () => {
        await render();
        const del = () => buttonNamed('Delete template');
        expect(del().getAttribute('aria-disabled')).toBe('true');
        await click(del());
        expect(field('report-template-name').value).toBe('Standard');

        await addTemplate('Second');
        expect(del().getAttribute('aria-disabled')).toBeNull();
        await click(del());
        expect(field('report-template-name').value).toBe('Standard');
        await save();
        expect(sentTemplates().map(t => t.id)).toEqual(['standard']);
    });

    it('does not give a new template the id of a stored one deleted in the dialog: it would inherit its logo', async () => {
        server.templates.push({ ...cloneSettings(DEFAULT_TEMPLATE), id: 'safety', name: 'Safety', logo: 'report-logo.png' },
            { ...cloneSettings(DEFAULT_TEMPLATE), id: 'new-template', name: 'New template', logo: 'report-logo.png' });
        await render();
        const choose = async index => {
            wrapper.findAllComponents(Select).find(c => c.props('inputId') === 'report-template-picker').vm.$emit('update:modelValue', index);
            await flushPromises();
        };
        await choose(2);
        await click(buttonNamed('Delete template'));
        await choose(1);
        await click(buttonNamed('Delete template'));
        await click(buttonNamed('Add template'));
        expect(body().textContent).toContain('new-template-2');
        await type('report-template-name', 'Safety');
        await save();
        expect(sentTemplates().map(t => t.id)).toEqual(['standard', 'safety-2']);
        expect(sentTemplates()[1].logo ?? null).toBeNull();
    });

    it('shows the preview of the values being typed', async () => {
        await render();
        await type('report-template-header', 'Acme Quarries');
        await type('report-template-footer', 'Confidential');
        await type('report-template-disclaimer', '**Not** advice');
        const page = body().querySelector('[data-test="preview-page"]');
        expect(page.textContent).toContain('Acme Quarries');
        expect(page.textContent).toContain('Confidential');
        expect(page.querySelector('.disclaimer strong').textContent).toBe('Not');
    });

    it('a script in the disclaimer does not reach the preview', async () => {
        await render();
        await type('report-template-disclaimer', '<img src=x onerror="alert(1)"><script>alert(2)</script>text');
        const page = body().querySelector('[data-test="preview-page"]');
        expect(page.querySelector('script')).toBeNull();
        expect(page.querySelector('[onerror]')).toBeNull();
    });
});

describe('ReportSettingsDialog: the logo', () => {
    const chosenFile = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    async function choose(file) {
        const input = body().querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new Event('change'));
        await flushPromises();
    }
    const upload = () => buttonNamed('Upload logo') ?? buttonNamed('Replace logo');
    const radio = mode => field(`report-template-logo-${mode}`);
    const pick = mode => click(radio(mode));
    const previewLogo = () => body().querySelector('[data-test="preview-page"] img');

    it('is the logo of the organization by default: shown in the field and the preview, nothing to upload', async () => {
        server.organizationLogoUrl = '/orgs/acme/logo?v=7';
        await render();
        expect(radio('organization').checked).toBe(true);
        expect(body().querySelector('img[alt="Logo of the organization"]').getAttribute('src')).toBe('/orgs/acme/logo?v=7');
        expect(previewLogo().getAttribute('src')).toBe('/orgs/acme/logo?v=7');
        expect(upload()).toBeUndefined();
    });

    it('says when the organization has none, and the preview falls back to the logo of the site', async () => {
        globalThis.HubOptions = { appLogo: '/images/site.svg' };
        try {
            await render();
            expect(body().querySelector('[data-test="organization-logo"]').textContent).toContain('The organization has no logo');
            expect(previewLogo().getAttribute('src')).toBe('/images/site.svg');
        } finally {
            delete globalThis.HubOptions;
        }
    });

    it('is not offered for a template that is only in the dialog, until it is saved', async () => {
        await render();
        await click(buttonNamed('Add template'));
        await type('report-template-name', 'Fresh');
        await pick('custom');
        expect(upload().getAttribute('aria-disabled')).toBe('true');
        expect(body().textContent).toContain('Save the template to add a logo');
        await click(upload());
        expect(registry.putFormData).not.toHaveBeenCalled();

        await save();
        expect(upload().getAttribute('aria-disabled')).toBeNull();
    });

    it('sends the logo prepared from the file, says what was saved, and the next save sends the new version (no conflict)', async () => {
        await render();
        await pick('custom');
        expect(radio('custom').checked).toBe(true);
        expect(body().textContent).toContain('Any image or SVG, up to 20 MB.');
        const chosen = chosenFile();
        await choose(chosen);

        expect(hoisted.prepareLogoFor).toHaveBeenCalledWith(chosen, { maxBytes: 512 * 1024, maxEdge: 600, problemOf: expect.any(Function) });
        expect(registry.putFormData).toHaveBeenCalledTimes(1);
        expect(registry.putFormData.mock.calls[0][0]).toBe('/orgs/acme/report-settings/templates/standard/logo');
        expect(registry.putFormData.mock.calls[0][1].get('file').name).toBe('logo.webp');
        expect(hoisted.notify.success).toHaveBeenCalledWith('Saved as WebP, 512 × 288, 61 KB', { summary: 'Logo saved' });
        // The template now shows its logo, in the form and in the preview
        expect(body().querySelector('img[alt="Logo of the template"]').getAttribute('src')).toBe('/orgs/acme/report-settings/templates/standard/logo?v=4');
        expect(previewLogo().getAttribute('src')).toBe('/orgs/acme/report-settings/templates/standard/logo?v=4');

        await type('report-template-header', 'Header');
        await save();
        expect(registry.putRequest.mock.calls[0][1].version).toBe(4);
        expect(body().querySelector('[data-test="form-error"]')).toBeNull();
        expect(confirmDialog()).toBeNull();
    });

    it('does not send a file that cannot be a logo, and says why at the field', async () => {
        hoisted.prepareLogoFor.mockRejectedValueOnce(new LogoProblem('The file is not an image Hub can read'));
        await render();
        await pick('custom');
        await choose(chosenFile());
        expect(registry.putFormData).not.toHaveBeenCalled();
        expect(body().querySelector('#report-template-logo-error').textContent).toContain('The file is not an image Hub can read');
    });

    it('a template with a custom logo is Custom; choosing Organization asks, and Cancel keeps the logo', async () => {
        server.templates[0].logo = 'report-logo.png';
        await render();
        expect(radio('custom').checked).toBe(true);
        expect(buttonNamed('Replace logo')).toBeDefined();

        await pick('organization');
        expect(confirmDialog().textContent).toContain('Remove the custom logo of');
        await click(confirmDialog().querySelector('[data-cancel]') ?? buttonNamed('Cancel'));
        expect(registry.deleteRequest).not.toHaveBeenCalled();
        expect(radio('custom').checked).toBe(true);
        expect(body().querySelector('img[alt="Logo of the template"]')).not.toBeNull();
    });

    it('choosing Organization over a custom logo removes it after the question, and the version moves on', async () => {
        server.templates[0].logo = 'report-logo.png';
        server.organizationLogoUrl = '/orgs/acme/logo?v=7';
        await render();
        await pick('organization');
        await click(confirmDialog().querySelector('[data-confirm]'));
        expect(registry.deleteRequest).toHaveBeenCalledWith('/orgs/acme/report-settings/templates/standard/logo');
        expect(radio('organization').checked).toBe(true);
        expect(body().querySelector('img[alt="Logo of the template"]')).toBeNull();
        expect(previewLogo().getAttribute('src')).toBe('/orgs/acme/logo?v=7');
        await save();
        expect(registry.putRequest.mock.calls[0][1].version).toBe(4);
    });

    it('says to save the template when the Registry has none to give the logo to (404)', async () => {
        await render();
        await pick('custom');
        registry.putFormData.mockRejectedValueOnce(new ApiError('Not found', 404));
        await choose(chosenFile());
        expect(body().querySelector('[data-test="form-error"]').textContent).toContain('save it, then add its logo');
    });

    it('a logo does not count as a change to discard', async () => {
        await render();
        await pick('custom');
        await choose(chosenFile());
        await click(buttonNamed('Close'));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});

describe('ReportSettingsDialog: a conflict (409)', () => {
    it('asks to reload, and Reload reads the Registry\'s version and drops the edits', async () => {
        await render();
        await type('report-template-header', 'My edit');
        // Someone else saved first
        server.version = 9;
        server.templates[0].headerText = 'Their edit';
        registry.putRequest.mockImplementationOnce(async () => { throw new ApiError('Conflict', 409); });
        await save();
        expect(confirmDialog()).not.toBeNull();
        expect(confirmDialog().textContent).toContain('Someone else saved');
        await click(confirmDialog().querySelector('[data-confirm]'));
        expect(registry.getRequest).toHaveBeenCalledTimes(2);
        expect(field('report-template-header').value).toBe('Their edit');
        await save();
        expect(registry.putRequest.mock.calls.at(-1)[1].version).toBe(9);
    });

    it('Keep editing leaves the edits', async () => {
        await render();
        await type('report-template-header', 'My edit');
        registry.putRequest.mockImplementationOnce(async () => { throw new ApiError('Conflict', 409); });
        await save();
        await click(confirmDialog().querySelector('[data-cancel]'));
        expect(confirmDialog()).toBeNull();
        expect(field('report-template-header').value).toBe('My edit');
        expect(registry.getRequest).toHaveBeenCalledTimes(1);
    });
});

describe('ReportSettingsDialog: the Registry refuses (400)', () => {
    it('shows each problem at the field it names, and lists them', async () => {
        await render();
        registry.putRequest.mockRejectedValueOnce(new ApiError('One or more validation errors occurred.', 400, {
            errors: { 'Templates[0].HeaderText': ['The header is too long.'] }
        }));
        await save();
        expect(body().querySelector('#report-template-header-error').textContent).toBe('The header is too long.');
        expect(field('report-template-header').getAttribute('aria-invalid')).toBe('true');
        expect(body().querySelector('[data-test="form-error"]').textContent).toContain('The header is too long.');
        // An edit answers it
        await type('report-template-header', 'shorter');
        expect(body().querySelector('#report-template-header-error')).toBeNull();
    });

    it('takes the user to the schema tab for a problem of the schema', async () => {
        await render();
        registry.putRequest.mockRejectedValueOnce(new ApiError('Invalid', 400, { errors: { 'Schema.Categories[1].Name': ['Name is taken.'] } }));
        await save();
        expect(tab('Annotation schema').getAttribute('aria-selected')).toBe('true');
        expect(body().textContent).toContain('Name is taken.');
    });

    it('shows the message of a failure that names no setting', async () => {
        await render();
        registry.putRequest.mockRejectedValueOnce(new ApiError('Forbidden', 403));
        await save();
        expect(body().querySelector('[data-test="form-error"]').textContent).toContain('Forbidden');
    });
});

describe('ReportSettingsDialog: the annotation schema', () => {
    const category = index => body().querySelectorAll('[data-test="schema-categories"] .schema-entry')[index];

    it('keeps the last category and the last status; a severity may all go', async () => {
        server.schema.categories = [server.schema.categories[0]];
        server.schema.statuses = [server.schema.statuses[0]];
        await render();
        await click(tab('Annotation schema'));
        const remove = list => body().querySelector(`[data-test="schema-${list}"] button[aria-label^="Remove"]`);
        expect(remove('categories').getAttribute('aria-disabled')).toBe('true');
        expect(remove('statuses').getAttribute('aria-disabled')).toBe('true');
        await click(remove('categories'));
        expect(body().querySelectorAll('[data-test="schema-categories"] .schema-entry')).toHaveLength(1);

        for (let i = 0; i < 4; i++) await click(remove('severities'));
        expect(body().querySelectorAll('[data-test="schema-severities"] .schema-entry')).toHaveLength(0);
        await save();
        expect(registry.putRequest.mock.calls[0][1].schema.severities).toEqual([]);
    });

    it('removes a category once there is another', async () => {
        await render();
        await click(tab('Annotation schema'));
        await click(category(1).querySelector('button[aria-label^="Remove"]'));
        expect(body().querySelectorAll('[data-test="schema-categories"] .schema-entry')).toHaveLength(4);
        await save();
        expect(registry.putRequest.mock.calls[0][1].schema.categories.map(c => c.id)).toEqual(['general', 'observation', 'safety', 'stockpile']);
    });

    it('a new entry has an id made from its name; a saved one keeps its id when renamed', async () => {
        await render();
        await click(tab('Annotation schema'));
        await click(buttonNamed('Add category'));
        const added = body().querySelectorAll('[data-test="schema-categories"] .schema-entry').length - 1;
        await type(category(added).querySelector('input[type="text"]').id, 'Fire hazard');
        await type(category(0).querySelector('input[type="text"]').id, 'Everything else');
        await save();
        const sent = registry.putRequest.mock.calls[0][1].schema.categories;
        expect(sent[0]).toMatchObject({ id: 'general', name: 'Everything else' });
        expect(sent.at(-1)).toMatchObject({ id: 'fire-hazard', name: 'Fire hazard' });
        expect(sent.at(-1).colour).toMatch(/^#[0-9a-f]{6}$/);

        // Saved now: the id stays when the name changes
        await type(category(added).querySelector('input[type="text"]').id, 'Fire');
        await save();
        expect(registry.putRequest.mock.calls[1][1].schema.categories.at(-1)).toMatchObject({ id: 'fire-hazard', name: 'Fire' });
    });

    it('does not give a new entry the id of a stored one removed in the dialog: it would take over its annotations', async () => {
        await render();
        await click(tab('Annotation schema'));
        const ids = () => [...body().querySelectorAll('[data-test="schema-categories"] .schema-entry')].length;
        const safety = [...body().querySelectorAll('[data-test="schema-categories"] .schema-entry')].findIndex(e => e.querySelector('input[type="text"]').value === 'Safety');
        expect(safety).toBeGreaterThan(-1);
        await click(category(safety).querySelector('button[aria-label^="Remove"]'));
        await click(buttonNamed('Add category'));
        await type(category(ids() - 1).querySelector('input[type="text"]').id, 'Safety');
        await save();
        const sent = registry.putRequest.mock.calls[0][1].schema.categories;
        expect(sent.map(c => c.id)).not.toContain('safety');
        expect(sent.at(-1)).toMatchObject({ id: 'safety-2', name: 'Safety' });
    });

    it('a new status has the closed flag, off', async () => {
        await render();
        await click(tab('Annotation schema'));
        await click(buttonNamed('Add status'));
        await type(body().querySelectorAll('[data-test="schema-statuses"] input[type="text"]')[3].id, 'Blocked');
        await save();
        expect(registry.putRequest.mock.calls[0][1].schema.statuses.at(-1)).toEqual({ id: 'blocked', name: 'Blocked', closed: false });
    });

    it('moves an entry up and down: the order is the display order', async () => {
        await render();
        await click(tab('Annotation schema'));
        await click(category(1).querySelector('button[aria-label$="up"]'));
        await save();
        expect(registry.putRequest.mock.calls[0][1].schema.categories.map(c => c.id).slice(0, 3)).toEqual(['defect', 'general', 'observation']);
    });

    it('refuses an empty name at the entry, naming it by position', async () => {
        await render();
        await click(tab('Annotation schema'));
        await type(category(2).querySelector('input[type="text"]').id, '');
        await save();
        expect(registry.putRequest).not.toHaveBeenCalled();
        expect(category(2).textContent).toContain('Enter a name');
        expect(category(2).querySelector('input[type="text"]').getAttribute('aria-invalid')).toBe('true');
    });
});

describe('ReportSettingsDialog: leaving', () => {
    it('asks before it drops changes, and Discard closes', async () => {
        await render();
        await type('report-template-header', 'x');
        await click(buttonNamed('Close'));
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(confirmDialog().textContent).toContain('not saved');
        await click(confirmDialog().querySelector('[data-cancel]'));
        expect(wrapper.emitted('close')).toBeUndefined();
        await click(buttonNamed('Close'));
        await click(confirmDialog().querySelector('[data-confirm]'));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('closes without a question once the changes are saved', async () => {
        await render();
        await type('report-template-header', 'x');
        await save();
        await click(buttonNamed('Close'));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
