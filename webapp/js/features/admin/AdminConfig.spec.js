import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({
    sys: { config: null },
    copyText: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/composables/useCopyText', () => ({ copyText: text => h.copyText(text) }));
// The page's leave guard, kept to be called as the router would
const guards = vi.hoisted(() => ({ leave: null, update: null }));
vi.mock('vue-router', async importOriginal => ({
    ...(await importOriginal()),
    onBeforeRouteLeave: fn => { guards.leave = fn; },
    onBeforeRouteUpdate: fn => { guards.update = fn; },
    useRouter: () => undefined
}));

const { ref } = await import('vue');
const { ApiError } = await import('@/libs/ddb/apiError');
const { deniedLocation } = await import('@/libs/authRoutes');
const { default: Select } = await import('primevue/select');
const { default: AdminConfig } = await import('./AdminConfig.vue');

const field = (key, fieldType, currentValue, defaultValue = currentValue) => ({
    key, displayName: key, fieldType, currentValue, defaultValue, description: `${key} help`,
    isSet: false, sensitive: false, enumOptions: fieldType === 'enum' ? ['security', 'all', 'off'] : null
});
const CONFIG = {
    sections: [{
        name: 'UpdateCheck',
        title: 'Update check',
        description: 'Update check: disabled (AppSettings:UpdateCheckCron). Docs: https://docs.dronedb.app/docs/self-hosting/update-check',
        isActive: false,
        fields: [
            field('UpdateCheckEmail', 'enum', 'all', 'security'),
            field('InstanceId', 'info', '0f8fad5b-d9cb-469f-a165-70867728950e')
        ]
    }]
};

let wrapper;
let notify;
async function show(stubs = { UsageAndContactCard: true, EmailTemplatesCard: true }, config = CONFIG) {
    h.sys.config = vi.fn(() => Promise.resolve(structuredClone(config)));
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    wrapper = mount(AdminConfig, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            stubs,
            mocks: { $notify: notify, $router: { push: vi.fn() } }
        }
    });
    await flushPromises();
    return wrapper;
}
const buttonOf = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
const fieldOf = key => [...document.querySelectorAll('.config-field')].find(f => f.querySelector('label')?.textContent === key);
// A card that exposes a dirty state, as the real ones do
const dirtyCard = (name, dirty) => ({ name, template: '<div />', setup(_, { expose }) { expose({ dirty }); } });
const question = () => document.body.querySelector('#confirmDialog');
async function answer(label) {
    [...question().querySelectorAll('button')].find(b => b.textContent.trim() === label).click();
    await flushPromises();
}
const editEmailSetting = async value => {
    await wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
    await flushPromises();
};
const tasks = { path: '/admin/tasks', fullPath: '/admin/tasks' };
const here = { path: '/admin/config', fullPath: '/admin/config' };

beforeEach(() => {
    h.copyText = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('AdminConfig', () => {
    it('has the usage and the e-mail templates cards (each decides whether it shows)', async () => {
        await show();
        expect(wrapper.findComponent({ name: 'UsageAndContactCard' }).exists()).toBe(true);
        expect(wrapper.findComponent({ name: 'EmailTemplatesCard' }).exists()).toBe(true);
    });

    it('mounts the cards once, after the configuration is loaded (each card loads its own data on mount)', async () => {
        let mounts = 0;
        const Card = { name: 'EmailTemplatesCard', template: '<div />', mounted: () => { mounts++; } };
        let resolveConfig;
        h.sys.config = vi.fn(() => new Promise(resolve => { resolveConfig = resolve; }));
        wrapper = mount(AdminConfig, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
                stubs: { UsageAndContactCard: true, EmailTemplatesCard: Card },
                mocks: { $notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, $router: { push: vi.fn() } }
            }
        });
        await flushPromises();
        expect(mounts).toBe(0);

        resolveConfig(structuredClone(CONFIG));
        await flushPromises();
        expect(mounts).toBe(1);
    });

    it('shows an informational value read-only, not as a setting', async () => {
        await show();
        const info = fieldOf('InstanceId');
        const input = info.querySelector('input');
        expect(input.value).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
        expect(input.readOnly).toBe(true);
        expect(info.textContent).toContain('Read-only');
        expect(info.textContent).not.toContain('Default');
    });

    it('leaves informational values out of the full file, and writes the keys where Registry reads them', async () => {
        await show();
        buttonOf('Copy full file').click();
        await flushPromises();

        expect(h.copyText).toHaveBeenCalledTimes(1);
        // UpdateCheckEmail is a direct key of AppSettings: the section only groups it on the page
        expect(JSON.parse(h.copyText.mock.calls[0][0])).toEqual({ AppSettings: { UpdateCheckEmail: 'all' } });
    });

    it('names each section header by its title, described by its Custom/Default tag', async () => {
        await show();
        const header = document.querySelector('button[aria-label="Update check"]');
        expect(header).not.toBeNull();
        expect(document.getElementById(header.getAttribute('aria-describedby')).textContent).toBe('Default');
    });

    it('says that it does not change the server, and how to use what it copies (D-005)', async () => {
        await show();
        expect(wrapper.text()).toContain('This page does not change the server. Merge the copied keys into appsettings.json, then restart the Registry. Do not replace the file with them.');
    });

    // FR-ACC-15: the server refuses the admin rights the client believed in
    it('goes home with the notice of the guard when the server refuses it (403), and stays refused', async () => {
        const push = vi.fn(() => Promise.resolve());
        h.sys.config = vi.fn(() => Promise.reject(new ApiError('Forbidden', 403)));
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        wrapper = mount(AdminConfig, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
                stubs: { UsageAndContactCard: true, EmailTemplatesCard: true },
                mocks: { $notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, $router: { push } }
            }
        });
        await flushPromises();
        error.mockRestore();
        expect(push).toHaveBeenCalledOnce();
        expect(push).toHaveBeenCalledWith(deniedLocation('AdminConfig'));
        expect(push).toHaveBeenCalledWith({ name: 'Organizations', query: { notice: 'denied:AdminConfig' } });
        // Nothing of the configuration is shown
        expect(wrapper.find('.config-field').exists()).toBe(false);
    });

    describe('edits', () => {
        it('shows the edit count in a bar, and Discard edits drops them', async () => {
            await show();
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            await editEmailSetting('off');
            expect(wrapper.find('.edits-bar').text()).toContain('1 edit');

            await wrapper.find('.edits-bar button[aria-label="Discard edits"]').trigger('click');
            await flushPromises();
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            expect(notify.info).toHaveBeenCalledWith(expect.any(String), { summary: 'Edits discarded' });
            expect(await guards.leave(tasks, here)).toBe(true);
            expect(question()).toBeNull();
        });

        it('leaving with modified fields asks once; Cancel keeps the value', async () => {
            await show();
            await editEmailSetting('off');
            const first = guards.leave(tasks, here);
            const second = guards.leave({ path: '/admin/users', fullPath: '/admin/users' }, here);
            await flushPromises();
            expect(document.body.querySelectorAll('#confirmDialog')).toHaveLength(1);

            await answer('Cancel');
            expect(await first).toBe(false);
            expect(await second).toBe(false);
            expect(wrapper.findComponent(Select).props('modelValue')).toBe('off');
            expect(wrapper.find('.edits-bar').text()).toContain('1 edit');
        });

        it('Discard in the question leaves', async () => {
            await show();
            await editEmailSetting('off');
            const leaving = guards.leave(tasks, here);
            await flushPromises();
            await answer('Discard');
            expect(await leaving).toBe(true);
        });

        it('asks nothing when nothing is edited, or for the Preferences query on this page', async () => {
            await show();
            expect(await guards.leave(tasks, here)).toBe(true);
            await editEmailSetting('off');
            expect(await guards.update({ ...here, query: { preferences: 'general' } }, here)).toBe(true);
            expect(question()).toBeNull();
        });
    });

    describe('the cards', () => {
        it('a router push while only the e-mail template card is dirty asks once; Cancel keeps the edit', async () => {
            const cardDirty = ref(true);
            await show({ UsageAndContactCard: true, EmailTemplatesCard: dirtyCard('EmailTemplatesCard', cardDirty) });
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            const leaving = guards.leave(tasks, here);
            const again = guards.update({ ...here, path: '/admin/config/other' }, here);
            await flushPromises();
            expect(document.body.querySelectorAll('#confirmDialog')).toHaveLength(1);
            await answer('Cancel');
            expect(await leaving).toBe(false);
            expect(await again).toBe(false);
            expect(cardDirty.value).toBe(true);

            cardDirty.value = false;
            expect(await guards.leave(tasks, here)).toBe(true);
        });

        it('asks while the usage card has a change', async () => {
            await show({ UsageAndContactCard: dirtyCard('UsageAndContactCard', ref(true)), EmailTemplatesCard: true });
            const leaving = guards.leave(tasks, here);
            await flushPromises();
            expect(question()).not.toBeNull();
            await answer('Cancel');
            expect(await leaving).toBe(false);
        });

        it('a page unload shows the browser question once a card is dirty', async () => {
            const cardDirty = ref(false);
            await show({ UsageAndContactCard: true, EmailTemplatesCard: dirtyCard('EmailTemplatesCard', cardDirty) });
            const unload = () => {
                const e = new Event('beforeunload', { cancelable: true });
                window.dispatchEvent(e);
                return e.defaultPrevented;
            };
            expect(unload()).toBe(false);
            cardDirty.value = true;
            await flushPromises();
            expect(unload()).toBe(true);
        });
    });
    // FR-ADM-06, FR-ADM-13: each cron, timespan and JSON value is checked while the admin types
    describe('validation of cron, timespan and JSON values', () => {
        const VALIDATED = {
            sections: [{
                name: 'Checks', title: 'Checks', description: 'Fields with a rule', isActive: false,
                fields: [
                    { ...field('ThumbnailsCacheExpiration', 'timespan', '00:30:00') },
                    { ...field('RecoverCron', 'cron', null, '* * * * *') },
                    { ...field('SomeCron', 'cron', null, null) },
                    { ...field('Favicon', 'json', null, null) },
                    field('Name', 'text', 'x')
                ]
            }]
        };
        const input = key => fieldOf(key).querySelector('input, textarea');
        const type = async (key, value) => {
            const el = input(key);
            el.value = value;
            el.dispatchEvent(new Event('input'));
            await flushPromises();
        };
        const errorOf = key => fieldOf(key).querySelector('.field-error')?.textContent ?? null;
        const copy = async () => {
            buttonOf('Copy changes').click();
            await flushPromises();
        };

        it('shows the rule next to an invalid timespan, cron and JSON value, and marks the field', async () => {
            await show(undefined, VALIDATED);
            await type('ThumbnailsCacheExpiration', 'not-a-time');
            await type('RecoverCron', 'every day please');
            await type('Favicon', '{ not json');

            expect(errorOf('ThumbnailsCacheExpiration')).toBe('Not a valid time span: use days (such as 2) or [days.]hh:mm[:ss] with hours up to 23 (such as 00:30:00 for 30 minutes).');
            expect(errorOf('RecoverCron')).toBe('Not a valid cron expression: use 5 or 6 fields separated by spaces (such as 0 0 * * *), a macro such as @daily, or disabled, off, none to turn the job off.');
            expect(errorOf('Favicon')).toMatch(/^Not valid JSON/);
            expect(errorOf('Name')).toBeNull();
            const timespan = input('ThumbnailsCacheExpiration');
            expect(timespan.getAttribute('aria-invalid')).toBe('true');
            expect(timespan.getAttribute('aria-describedby')).toContain(`${timespan.id}-error`);
            expect(document.getElementById(`${timespan.id}-error`).textContent).toBe(errorOf('ThumbnailsCacheExpiration'));
        });

        it('clears the error as soon as the value is valid, and accepts blank, off, none and 0 0 * * *', async () => {
            await show(undefined, VALIDATED);
            await type('RecoverCron', 'every day please');
            expect(errorOf('RecoverCron')).not.toBeNull();
            for (const value of ['off', 'NONE', '0 0 * * *', '@daily', '@Every_Minute', '']) {
                await type('RecoverCron', value);
                expect(errorOf('RecoverCron'), value).toBeNull();
            }
            await type('ThumbnailsCacheExpiration', '1.02:03:04');
            expect(errorOf('ThumbnailsCacheExpiration')).toBeNull();
            expect(input('RecoverCron').getAttribute('aria-invalid')).toBeNull();
        });

        it('keeps both Copy buttons enabled; a Copy with invalid values copies nothing and shows the number of invalid fields', async () => {
            await show(undefined, VALIDATED);
            await type('ThumbnailsCacheExpiration', 'not-a-time');
            await type('RecoverCron', 'every day please');
            await type('Favicon', '{ not json');
            // Copy changes and Copy full file, in the top bar and in the edits bar
            const copyButtons = [...document.querySelectorAll('button')].filter(b => ['Copy changes', 'Copy full file'].includes(b.textContent.trim()));
            expect(copyButtons.map(b => b.textContent.trim())).toEqual(['Copy full file', 'Copy changes', 'Copy full file', 'Copy changes']);
            expect(copyButtons.map(b => b.disabled)).toEqual([false, false, false, false]);

            await copy();

            expect(h.copyText).not.toHaveBeenCalled();
            const summary = document.querySelector('.invalid-summary');
            expect(summary.textContent).toContain('Nothing was copied: 3 fields have an invalid value (ThumbnailsCacheExpiration, RecoverCron, Favicon)');
            expect(summary.getAttribute('role')).toBe('alert');
            expect(document.activeElement).toBe(input('ThumbnailsCacheExpiration'));
            expect(notify.success).not.toHaveBeenCalled();
            expect(document.querySelector('.section-header').textContent).toContain('3 invalid');
        });

        it('copies once the invalid values are fixed, and the summary goes', async () => {
            await show(undefined, VALIDATED);
            await type('RecoverCron', 'every day please');
            await copy();
            expect(document.querySelector('.invalid-summary').textContent).toContain('1 field has an invalid value');
            expect(h.copyText).not.toHaveBeenCalled();

            await type('RecoverCron', '0 3 * * *');
            expect(document.querySelector('.invalid-summary')).toBeNull();
            await copy();
            expect(h.copyText).toHaveBeenCalledTimes(1);
            expect(JSON.parse(h.copyText.mock.calls[0][0]).AppSettings).toMatchObject({ RecoverCron: '0 3 * * *' });
        });

        it('valid values copy; an unedited cron is left out (it is the default of its job)', async () => {
            await show(undefined, VALIDATED);
            await type('ThumbnailsCacheExpiration', '01:00:00');
            await copy();
            const copied = JSON.parse(h.copyText.mock.calls[0][0]).AppSettings;
            expect(copied.ThumbnailsCacheExpiration).toBe('01:00:00');
            expect(copied).not.toHaveProperty('RecoverCron');
            expect(copied).not.toHaveProperty('SomeCron');
        });

        it('an unedited value of the server is never judged: only an edited field blocks a Copy', async () => {
            // The server runs with these values (its own parser accepted them), whatever the page thinks of them
            const unedited = {
                sections: [{
                    name: 'Checks', title: 'Checks', description: 'Fields with a rule', isActive: false,
                    fields: [
                        field('Macro', 'cron', '@daily', '0 0 * * *'),
                        field('Odd', 'cron', 'what the server runs', null),
                        field('Name', 'text', 'x')
                    ]
                }]
            };
            await show(undefined, unedited);
            expect(errorOf('Odd')).toBeNull();
            expect(input('Odd').getAttribute('aria-invalid')).toBeNull();

            buttonOf('Copy full file').click();
            await flushPromises();
            expect(document.querySelector('.invalid-summary')).toBeNull();
            expect(h.copyText).toHaveBeenCalledTimes(1);

            // Once edited the same field is judged, and the other unedited one still is not
            await type('Odd', 'what the admin typed');
            expect(errorOf('Odd')).not.toBeNull();
            await copy();
            expect(h.copyText).toHaveBeenCalledTimes(1);
            expect(document.querySelector('.invalid-summary').textContent).toContain('1 field has an invalid value (Odd)');
            expect(errorOf('Macro')).toBeNull();
        });

        it('an empty cron shows the effective default as its placeholder, an empty one without a default says Not set', async () => {
            await show(undefined, VALIDATED);
            expect(input('RecoverCron').placeholder).toBe('Default: * * * * *');
            expect(input('SomeCron').placeholder).toBe('Not set');
            expect(input('ThumbnailsCacheExpiration').placeholder).toBe('Default: 00:30:00');
        });

        it('the cron hint names the words that switch a job off; the timespan hint says the format .NET reads', async () => {
            await show(undefined, VALIDATED);
            expect(fieldOf('RecoverCron').querySelector('.cron-hint').textContent).toContain('disabled, off, none (any case) turns the job off');
            expect(fieldOf('ThumbnailsCacheExpiration').querySelector('.timespan-hint').textContent)
                .toContain('Days, or [days.]hh:mm[:ss]');
        });
    });

    // FR-ADM-12 and D-005: Copy changes is the default, Copy full file the second action
    describe('the two Copy actions', () => {
        const SECTIONS = {
            sections: [{
                name: 'Auth', title: 'Auth', description: 'Auth settings', isActive: false,
                fields: [
                    field('TokenExpirationInDays', 'number', '7'),
                    { ...field('Secret', 'password', null, null), sensitive: true, isSet: true },
                    field('Name', 'text', 'x')
                ]
            }]
        };
        const setDays = async days => {
            wrapper.findComponent({ name: 'InputNumber' }).vm.$emit('update:modelValue', days);
            await flushPromises();
        };

        it('Copy changes gives only the edited keys, and its toast says to merge them into appsettings.json', async () => {
            await show(undefined, SECTIONS);
            await setDays(30);
            buttonOf('Copy changes').click();
            await flushPromises();

            expect(JSON.parse(h.copyText.mock.calls[0][0])).toEqual({ AppSettings: { TokenExpirationInDays: 30 } });
            expect(h.copyText.mock.calls[0][0]).not.toContain('<CHANGE-ME>');
            expect(notify.success).toHaveBeenCalledWith('Copied 1 key. Merge it into appsettings.json.', { summary: 'Copied' });
        });

        it('says how many keys it copied, and has nothing to copy when nothing is edited', async () => {
            await show(undefined, SECTIONS);
            buttonOf('Copy changes').click();
            await flushPromises();
            expect(h.copyText).not.toHaveBeenCalled();
            expect(notify.info).toHaveBeenCalledWith(expect.stringContaining('nothing to copy'), { summary: 'Nothing to copy' });
        });

        it('Copy full file gives every setting, and its toast lists the keys to fill in', async () => {
            await show(undefined, SECTIONS);
            buttonOf('Copy full file').click();
            await flushPromises();

            expect(JSON.parse(h.copyText.mock.calls[0][0])).toEqual({
                AppSettings: { TokenExpirationInDays: 7, Secret: '<CHANGE-ME>', Name: 'x' }
            });
            expect(notify.warn).toHaveBeenCalledWith('Copied the full file. Fill in: AppSettings:Secret.', { summary: 'Copied', life: 'long' });
        });
    });

    // FR-ADM-25: no PrimeVue deprecation warning, and the list field still edits
    describe('PrimeVue components', () => {
        it('writes no console warning when the page mounts', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
            await show(undefined, {
                sections: [{
                    name: 'Misc', title: 'Misc', description: 'd', isActive: false,
                    fields: [field('Names', 'array', 'a, b')]
                }]
            });
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });

        it('edits a list field: the chips show the values, and a new value is part of the copy', async () => {
            await show(undefined, {
                sections: [{
                    name: 'Misc', title: 'Misc', description: 'd', isActive: false,
                    fields: [field('Names', 'array', 'a, b')]
                }]
            });
            const chips = () => [...fieldOf('Names').querySelectorAll('.p-autocomplete-chip, [data-pc-section="chip"]')].map(c => c.textContent.trim());
            expect(chips()).toEqual(['a', 'b']);

            wrapper.findComponent({ name: 'AutoComplete' }).vm.$emit('update:modelValue', ['a', 'b', 'c']);
            await flushPromises();
            buttonOf('Copy changes').click();
            await flushPromises();
            expect(JSON.parse(h.copyText.mock.calls[0][0])).toEqual({ AppSettings: { Names: ['a', 'b', 'c'] } });
        });
    });
});
