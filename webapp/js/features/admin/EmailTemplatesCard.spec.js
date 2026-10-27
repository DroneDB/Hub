import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({
    sys: {},
    auth: null,
    notify: { success: vi.fn(), error: vi.fn() }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/libs/notify', () => ({ notify: h.notify }));
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({ flags: { emailEnabled: true }, feature(name) { return this.flags[name]; } });
    return { useAuthStore: () => h.auth };
});

const { default: EmailTemplatesCard } = await import('./EmailTemplatesCard.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const NAME = 'build-notification';
const TEMPLATE = {
    name: NAME,
    title: 'Build notifications',
    subject: '{{appName}}: {{summary}}',
    body: 'Hello {{user}},\n\n{{builds}}',
    isDefault: true,
    defaultSubject: '{{appName}}: {{summary}}',
    defaultBody: 'Hello {{user}},\n\n{{builds}}',
    placeholders: [
        { name: 'appName', description: 'The application name', inSubject: true },
        { name: 'user', description: 'The user name', inSubject: true },
        { name: 'builds', description: 'The list of builds', inSubject: false },
        { name: 'preferencesLink', description: 'The opt-out link', inSubject: false }
    ]
};
const PREVIEW = {
    subject: 'DroneDB: 1 build failed, 1 completed',
    text: 'Hello admin,\n\n- acme/site: cloud.laz failed',
    html: '<!DOCTYPE html><html><body><p>Hello admin</p><script>parent.hacked = true</script></body></html>'
};

let wrapper;
const dom = () => new DOMWrapper(document.body);
async function show() {
    wrapper = mount(EmailTemplatesCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return wrapper;
}
const button = (text, root = dom()) => root.findAll('button').find(b => b.text().trim() === text);
const chip = name => button(`{{${name}}}`);
const subjectInput = () => document.getElementById('email-template-subject');
const bodyInput = () => document.getElementById('email-template-body');
const confirmWindow = () => document.body.querySelector('#confirmDialog');
async function type(element, value) {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await flushPromises();
}
const badRequest = detail => new ApiError(detail, 400, { title: 'Bad Request', detail });

beforeEach(() => {
    h.auth.flags.emailEnabled = true;
    h.notify.success.mockClear();
    h.notify.error.mockClear();
    Object.assign(h.sys, {
        emailTemplates: vi.fn(() => Promise.resolve([{ name: NAME, title: 'Build notifications', isDefault: true }])),
        emailTemplate: vi.fn(() => Promise.resolve(structuredClone(TEMPLATE))),
        saveEmailTemplate: vi.fn((_name, text) => Promise.resolve({ ...structuredClone(TEMPLATE), ...text, isDefault: false })),
        resetEmailTemplate: vi.fn(() => Promise.resolve(structuredClone(TEMPLATE))),
        previewEmailTemplate: vi.fn(() => Promise.resolve(PREVIEW)),
        testEmailTemplate: vi.fn(() => Promise.resolve(null))
    });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('EmailTemplatesCard', () => {
    it('is not there, and asks nothing, on a server that sends no e-mail', async () => {
        h.auth.flags.emailEnabled = false;
        await show();
        expect(wrapper.find('.email-templates-card').exists()).toBe(false);
        expect(h.sys.emailTemplates).not.toHaveBeenCalled();
    });

    it('loads the first template of the list into the form', async () => {
        await show();
        expect(h.sys.emailTemplate).toHaveBeenCalledWith(NAME);
        expect(wrapper.text()).toContain('Build notifications');
        expect(wrapper.text()).toContain('Default');
        expect(subjectInput().value).toBe(TEMPLATE.subject);
        expect(bodyInput().value).toBe(TEMPLATE.body);
        expect(TEMPLATE.placeholders.every(p => chip(p.name))).toBe(true);
        expect(chip('builds').attributes('title')).toBe('The list of builds');
    });

    it('loads the templates once the feature flags say the server sends e-mail', async () => {
        h.auth.flags.emailEnabled = false;
        await show();
        h.auth.flags.emailEnabled = true;
        await flushPromises();
        expect(h.sys.emailTemplates).toHaveBeenCalledTimes(1);
        expect(subjectInput().value).toBe(TEMPLATE.subject);
    });

    it('says so when the templates cannot be loaded', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        h.sys.emailTemplates = vi.fn(() => Promise.reject(new Error('offline')));
        await show();
        expect(wrapper.text()).toContain('The e-mail templates could not be loaded.');
        expect(subjectInput()).toBeNull();
    });

    describe('placeholder chips', () => {
        it('insert {{name}} at the cursor of the body, replacing the selection, and keep the focus there', async () => {
            await show();
            await type(bodyInput(), 'Hi NAME!');
            bodyInput().focus();
            bodyInput().setSelectionRange(3, 7);
            await chip('user').trigger('click');
            expect(bodyInput().value).toBe('Hi {{user}}!');
            expect(document.activeElement).toBe(bodyInput());
            expect(bodyInput().selectionStart).toBe('Hi {{user}}'.length);
        });

        it('insert into the subject once it has the focus, where the body-only ones are disabled', async () => {
            await show();
            await type(subjectInput(), 'Builds of ');
            subjectInput().focus();
            await flushPromises();
            subjectInput().setSelectionRange(10, 10);
            expect(chip('builds').attributes('disabled')).toBeDefined();
            expect(chip('preferencesLink').attributes('disabled')).toBeDefined();
            expect(chip('appName').attributes('disabled')).toBeUndefined();
            await chip('appName').trigger('click');
            expect(subjectInput().value).toBe('Builds of {{appName}}');
        });

        it('keep the focus in the field when pressed (no blur on mousedown)', async () => {
            await show();
            const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });
            chip('user').element.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
        });
    });

    describe('unsaved changes', () => {
        it('Save is enabled only once the text differs from the saved one', async () => {
            await show();
            expect(button('Save').attributes('disabled')).toBeDefined();
            expect(wrapper.text()).not.toContain('Unsaved changes');
            await type(subjectInput(), 'New subject');
            expect(button('Save').attributes('disabled')).toBeUndefined();
            expect(wrapper.text()).toContain('Unsaved changes');
            await type(subjectInput(), TEMPLATE.subject);
            expect(button('Save').attributes('disabled')).toBeDefined();
        });

        it('Reset to default is disabled for the default text with no changes', async () => {
            await show();
            expect(button('Reset to default').attributes('disabled')).toBeDefined();
            await type(bodyInput(), 'Changed');
            expect(button('Reset to default').attributes('disabled')).toBeUndefined();
        });
    });

    it('saves the text, takes the server\'s answer and says so', async () => {
        await show();
        await type(subjectInput(), 'Builds on {{appName}}');
        await button('Save').trigger('click');
        await flushPromises();
        expect(h.sys.saveEmailTemplate).toHaveBeenCalledWith(NAME, { subject: 'Builds on {{appName}}', body: TEMPLATE.body });
        expect(h.notify.success).toHaveBeenCalledWith('E-mail template saved');
        expect(wrapper.text()).toContain('Custom');
        expect(wrapper.text()).not.toContain('Unsaved changes');
        expect(button('Save').attributes('disabled')).toBeDefined();
    });

    it('shows the server\'s reason for a refused text in the card, and keeps the text', async () => {
        h.sys.saveEmailTemplate = vi.fn(() => Promise.reject(badRequest('Unknown placeholder {{foo}} in the body')));
        await show();
        await type(bodyInput(), 'Hello {{foo}}');
        await button('Save').trigger('click');
        await flushPromises();
        expect(wrapper.find('.template-problem').text()).toContain('Unknown placeholder {{foo}} in the body');
        expect(h.notify.error).not.toHaveBeenCalled();
        expect(h.notify.success).not.toHaveBeenCalled();
        expect(bodyInput().value).toBe('Hello {{foo}}');
        expect(wrapper.text()).toContain('Unsaved changes');
    });

    it('notifies any other failure', async () => {
        const failure = new ApiError('Server error', 500);
        h.sys.saveEmailTemplate = vi.fn(() => Promise.reject(failure));
        await show();
        await type(bodyInput(), 'Changed');
        await button('Save').trigger('click');
        await flushPromises();
        expect(h.notify.error).toHaveBeenCalledWith(failure);
        expect(wrapper.find('.template-problem').exists()).toBe(false);
    });

    describe('Preview', () => {
        it('renders the unsaved text: the HTML in an empty sandbox, the text in a pre', async () => {
            await show();
            await type(subjectInput(), 'Draft {{summary}}');
            await button('Preview').trigger('click');
            await flushPromises();
            expect(h.sys.previewEmailTemplate).toHaveBeenCalledWith(NAME, { subject: 'Draft {{summary}}', body: TEMPLATE.body });
            const frame = wrapper.find('iframe.preview-html');
            expect(frame.attributes('sandbox')).toBe('');
            expect(frame.attributes('srcdoc')).toBe(PREVIEW.html);
            expect(frame.attributes('title')).toBeTruthy();
            expect(wrapper.find('pre.preview-text').text()).toBe(PREVIEW.text);
            expect(wrapper.text()).toContain(PREVIEW.subject);
            // The server's HTML is never part of this page
            expect(document.body.querySelector('.email-templates-card script')).toBeNull();
            await button('Close preview').trigger('click');
            expect(wrapper.find('iframe').exists()).toBe(false);
        });

        it('shows the reason of a refused text instead', async () => {
            h.sys.previewEmailTemplate = vi.fn(() => Promise.reject(badRequest('{{builds}} cannot be used in the subject')));
            await show();
            await button('Preview').trigger('click');
            await flushPromises();
            expect(wrapper.find('.template-problem').text()).toContain('{{builds}} cannot be used in the subject');
            expect(wrapper.find('iframe').exists()).toBe(false);
        });
    });

    it('Send me a test sends the unsaved text and confirms', async () => {
        await show();
        await type(bodyInput(), 'Test body {{builds}}');
        await button('Send me a test').trigger('click');
        await flushPromises();
        expect(h.sys.testEmailTemplate).toHaveBeenCalledWith(NAME, { subject: TEMPLATE.subject, body: 'Test body {{builds}}' });
        expect(h.notify.success).toHaveBeenCalledWith(expect.stringContaining('sent to your address'), { summary: 'Test e-mail sent' });
    });

    describe('Reset to default', () => {
        async function askToReset() {
            h.sys.emailTemplate = vi.fn(() => Promise.resolve({ ...structuredClone(TEMPLATE), subject: 'Mine', isDefault: false }));
            await show();
            await button('Reset to default').trigger('click');
            await flushPromises();
        }

        it('asks first, then resets and shows the default text', async () => {
            await askToReset();
            expect(confirmWindow()).not.toBeNull();
            expect(h.sys.resetEmailTemplate).not.toHaveBeenCalled();
            await button('Reset', new DOMWrapper(confirmWindow())).trigger('click');
            await flushPromises();
            expect(h.sys.resetEmailTemplate).toHaveBeenCalledWith(NAME);
            expect(subjectInput().value).toBe(TEMPLATE.defaultSubject);
            expect(wrapper.text()).toContain('Default');
            expect(h.notify.success).toHaveBeenCalledWith('E-mail template reset to the default');
        });

        it('does nothing when cancelled', async () => {
            await askToReset();
            await button('Cancel', new DOMWrapper(confirmWindow())).trigger('click');
            await flushPromises();
            expect(h.sys.resetEmailTemplate).not.toHaveBeenCalled();
            expect(subjectInput().value).toBe('Mine');
        });
    });

    describe('several templates', () => {
        const OTHER = { ...structuredClone(TEMPLATE), name: 'other', title: 'Other', subject: 'Other subject' };
        beforeEach(() => {
            h.sys.emailTemplates = vi.fn(() => Promise.resolve([
                { name: NAME, title: 'Build notifications', isDefault: true },
                { name: 'other', title: 'Other', isDefault: true }
            ]));
            h.sys.emailTemplate = vi.fn(name => Promise.resolve(name === 'other' ? structuredClone(OTHER) : structuredClone(TEMPLATE)));
        });
        const picker = () => wrapper.findAllComponents({ name: 'Select' }).at(0);

        it('offers a choice of template and loads the one chosen', async () => {
            await show();
            expect(picker().props('options').map(t => t.title)).toEqual(['Build notifications', 'Other']);
            await picker().vm.$emit('update:modelValue', 'other');
            await flushPromises();
            expect(h.sys.emailTemplate).toHaveBeenLastCalledWith('other');
            expect(subjectInput().value).toBe('Other subject');
        });

        it('asks before dropping unsaved changes', async () => {
            await show();
            await type(subjectInput(), 'Unsaved');
            await picker().vm.$emit('update:modelValue', 'other');
            await flushPromises();
            expect(confirmWindow()).not.toBeNull();
            await button('Cancel', new DOMWrapper(confirmWindow())).trigger('click');
            await flushPromises();
            expect(subjectInput().value).toBe('Unsaved');
            expect(h.sys.emailTemplate).toHaveBeenCalledTimes(1);
        });
    });
});
