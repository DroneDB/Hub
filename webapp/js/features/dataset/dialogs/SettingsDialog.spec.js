/**
 * The Settings window of a dataset (FR-EXP-24): General has the name (saved as the `name` metadata: the URL does not change
 * with it), the URL slug (a new one warns that links stop working, checks the slug rules, and renames the dataset) and the
 * tagline; Sharing has the visibility and the license. These are a draft that Save writes (the slug last, after the page
 * agrees), and Save closes the window. The Files buttons (thumbnail, README) act at once. Closing with changes that are not
 * saved asks first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import SettingsDialog from './SettingsDialog.vue';

// The window: its content, its footer, and its close and Enter (confirm) events as buttons the tests press
const WindowStub = {
    emits: ['close', 'confirm'],
    template: '<div><button class="stub-x" @click="$emit(\'close\')">x</button><button class="stub-enter" @click="$emit(\'confirm\')">enter</button><slot /><slot name="footer" /></div>'
};
const notify = { success: vi.fn(), error: vi.fn() };

const ROOT = {
    path: 'acme/site',
    properties: {
        readme: 'README.md',
        meta: { name: { id: 'x', data: 'Brighton Beach' }, tagline: { id: 'y', data: 'Shore' }, visibility: { id: 'z', data: 1 }, license: { id: 'w', data: 'CC-BY-4.0' } }
    }
};

let wrapper;
let dataset;
let calls;
async function render({ canWrite = true, root = ROOT, confirmSlugChange = undefined, confirmDiscard = undefined } = {}) {
    calls = [];
    const track = (what, result = {}) => vi.fn(async (...args) => { calls.push([what, ...args]); return result; });
    dataset = {
        org: 'acme', ds: 'site', info: vi.fn().mockResolvedValue([root]),
        metaSet: track('metaSet'), metaUnset: track('metaUnset'), setVisibility: track('setVisibility'),
        rename: track('rename', { slug: 'new-site' }), writeObj: vi.fn().mockResolvedValue({ path: 'README.md' }),
        datasetThumbUrl: () => '/thumb'
    };
    wrapper = mount(SettingsDialog, {
        props: { dataset, canWrite, confirmSlugChange, confirmDiscard },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const name = () => wrapper.find('#settings-name');
const slug = () => wrapper.find('#settings-slug');
const tagline = () => wrapper.find('#settings-tagline');
const button = label => wrapper.findAll('button').find(b => b.text() === label);
const writes = () => calls.length;
async function choose(key, value) {
    wrapper.vm[key] = value;
    await flushPromises();
}
async function save() {
    await button('Save').trigger('click');
    await flushPromises();
}
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('SettingsDialog draft', () => {
    it('shows the settings of the dataset, with Save disabled while nothing changed', async () => {
        await render();
        expect(name().element.value).toBe('Brighton Beach');
        expect(slug().element.value).toBe('site');
        expect(tagline().element.value).toBe('Shore');
        expect(button('Save').attributes('disabled')).toBeDefined();
        expect(wrapper.text()).not.toContain('Unsaved changes');
    });

    it('sends nothing while the fields change, the visibility and the license too, until Save', async () => {
        await render();
        await name().setValue('Brighton Pier');
        await name().trigger('change');
        await tagline().setValue('Pier');
        await tagline().trigger('change');
        await choose('visibility', 2);
        await choose('license', 'CC0-1.0');
        await slug().setValue('pier');
        await slug().trigger('keydown', { key: 'Enter' });
        await flushPromises();

        expect(writes()).toBe(0);
        expect(wrapper.emitted('changed')).toBeUndefined();
        expect(button('Save').attributes('disabled')).toBeUndefined();
        expect(wrapper.text()).toContain('Unsaved changes');
    });

    it('a field typed back to its value is no change', async () => {
        await render();
        await name().setValue('Other');
        await name().setValue('  Brighton Beach ');
        expect(button('Save').attributes('disabled')).toBeDefined();
    });

    it('a reader sees the sharing settings, disabled, and only Close', async () => {
        await render({ canWrite: false });
        expect(name().exists()).toBe(false);
        expect(button('Save')).toBeUndefined();
        expect(button('Cancel')).toBeUndefined();
        await button('Close').trigger('click');
        expect(wrapper.emitted('close')).toEqual([['close']]);
    });
});

describe('SettingsDialog Save', () => {
    it('writes only the settings that changed, trimmed, says so once, tells the page and closes', async () => {
        await render();
        await name().setValue('  Brighton Pier  ');
        await choose('visibility', 2);
        await save();

        expect(calls).toEqual([['metaSet', 'name', 'Brighton Pier'], ['setVisibility', 2]]);
        expect(dataset.rename).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledWith('Settings saved', { summary: 'Dataset Settings' });
        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(wrapper.emitted('close')).toEqual([['saved']]);
        expect(name().element.value).toBe('Brighton Pier');
    });

    it('writes every setting in order, the slug last, after the page agrees with the old and new slug', async () => {
        const confirmSlugChange = vi.fn().mockResolvedValue(true);
        await render({ confirmSlugChange });
        await slug().setValue('new-site');
        await name().setValue('Pier');
        await tagline().setValue('Wooden');
        await choose('license', 'CC0-1.0');
        await choose('visibility', 2);
        await save();

        expect(confirmSlugChange).toHaveBeenCalledWith('site', 'new-site');
        expect(calls).toEqual([
            ['metaSet', 'name', 'Pier'], ['metaSet', 'tagline', 'Wooden'], ['metaSet', 'license', 'CC0-1.0'],
            ['setVisibility', 2], ['rename', 'new-site']
        ]);
        expect(wrapper.emitted('slugRenamed')).toEqual([['new-site']]);
        // The page goes to the new address: the window does not close itself
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('Enter in a field saves', async () => {
        await render();
        await tagline().setValue('Pier');
        await tagline().trigger('change');
        await flushPromises();
        expect(writes()).toBe(0);
        await wrapper.find('.stub-enter').trigger('click');
        await flushPromises();
        expect(calls).toEqual([['metaSet', 'tagline', 'Pier']]);
    });

    it('removes an emptied tagline', async () => {
        await render();
        await tagline().setValue('   ');
        await save();
        expect(calls).toEqual([['metaUnset', 'tagline']]);
    });

    it('refuses an empty name at the field and sends nothing', async () => {
        await render();
        await name().setValue('   ');
        await choose('visibility', 2);
        await save();

        expect(writes()).toBe(0);
        expect(wrapper.find('#settings-name-error').text()).toBe('Enter a name');
        expect(name().attributes('aria-invalid')).toBe('true');
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('refuses a slug that breaks the slug rules at the field, with the rule of the Registry, and sends nothing', async () => {
        const confirmSlugChange = vi.fn().mockResolvedValue(true);
        await render({ confirmSlugChange });
        await slug().setValue('New Site');
        await save();

        expect(confirmSlugChange).not.toHaveBeenCalled();
        expect(writes()).toBe(0);
        expect(wrapper.find('#settings-slug-error').text()).toBe(
            "Dataset slug is invalid: it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'");
    });

    it('warns that the links will change as soon as the slug differs', async () => {
        await render();
        expect(wrapper.find('.slug-warning').exists()).toBe(false);
        await slug().setValue('new-site');
        expect(wrapper.find('.slug-warning').text()).toBe('Links to /r/acme/site will stop working');
        expect(wrapper.text()).toContain('/r/acme/new-site');
    });

    it('sends nothing and stays open when the page does not agree to the new slug', async () => {
        const confirmSlugChange = vi.fn().mockResolvedValue(false);
        await render({ confirmSlugChange });
        await slug().setValue('new-site');
        await name().setValue('Pier');
        await save();

        expect(confirmSlugChange).toHaveBeenCalledTimes(1);
        expect(writes()).toBe(0);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(button('Save').attributes('disabled')).toBeUndefined();
    });

    it('shows a slug that is taken, as the Registry says it, at the field; the settings written before it are saved', async () => {
        await render();
        dataset.rename.mockRejectedValue(new Error('A dataset with this slug already exists'));
        await name().setValue('Pier');
        await slug().setValue('taken');
        await save();

        expect(wrapper.find('#settings-slug-error').text()).toBe('A dataset with this slug already exists');
        expect(wrapper.emitted('slugRenamed')).toBeUndefined();
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(notify.success).not.toHaveBeenCalled();

        // Only the slug is still a change: a second Save sends it alone
        dataset.rename.mockImplementation(async s => { calls.push(['rename', s]); return { slug: s }; });
        calls.length = 0;
        await slug().setValue('free');
        await save();
        expect(calls).toEqual([['rename', 'free']]);
    });

    it('stops at a setting the Registry refuses, says which, and sends nothing after it', async () => {
        await render();
        dataset.metaSet.mockImplementation(async key => {
            calls.push(['metaSet', key]);
            if (key === 'license') throw new Error('Forbidden');
            return {};
        });
        await tagline().setValue('Pier');
        await choose('license', 'CC0-1.0');
        await choose('visibility', 2);
        await save();

        expect(calls).toEqual([['metaSet', 'tagline'], ['metaSet', 'license']]);
        expect(wrapper.text()).toContain('Could not save the license: Forbidden');
        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('shows the refusal of the Registry for the name at the field', async () => {
        await render();
        dataset.metaSet.mockRejectedValue(new Error('The name is too long: use 1 to 256 characters'));
        await name().setValue('Another');
        await save();

        expect(wrapper.find('#settings-name-error').text()).toBe('The name is too long: use 1 to 256 characters');
        expect(wrapper.emitted('changed')).toBeUndefined();
    });
});

describe('SettingsDialog closing with changes', () => {
    it('closes at once without changes', async () => {
        const confirmDiscard = vi.fn().mockResolvedValue(false);
        await render({ confirmDiscard });
        await button('Cancel').trigger('click');
        await flushPromises();

        expect(confirmDiscard).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toEqual([['close']]);
    });

    it('asks first, from Cancel and from the window (X, Escape, a click beside it), and stays open on No', async () => {
        const confirmDiscard = vi.fn().mockResolvedValue(false);
        await render({ confirmDiscard });
        await choose('visibility', 2);
        await button('Cancel').trigger('click');
        await wrapper.find('.stub-x').trigger('click');
        await flushPromises();

        expect(confirmDiscard).toHaveBeenCalledTimes(2);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(writes()).toBe(0);
    });

    it('closes without saving when the user discards', async () => {
        const confirmDiscard = vi.fn().mockResolvedValue(true);
        await render({ confirmDiscard });
        await name().setValue('Pier');
        await button('Cancel').trigger('click');
        await flushPromises();

        expect(wrapper.emitted('close')).toEqual([['close']]);
        expect(writes()).toBe(0);
    });

    it('asks before Rescan and the README buttons, which close the window', async () => {
        const confirmDiscard = vi.fn().mockResolvedValue(false);
        await render({ confirmDiscard });
        await name().setValue('Pier');
        await button('Open').trigger('click');
        await button('Edit').trigger('click');
        await button('Rescan Dataset').trigger('click');
        await flushPromises();

        expect(confirmDiscard).toHaveBeenCalledTimes(3);
        expect(wrapper.emitted('openReadme')).toBeUndefined();
        expect(wrapper.emitted('editReadme')).toBeUndefined();
        expect(wrapper.emitted('rescanRequested')).toBeUndefined();
    });

    it('asks before Add Readme, and creates no file on No', async () => {
        const confirmDiscard = vi.fn().mockResolvedValue(false);
        await render({ root: { path: 'acme/site', properties: { meta: {} } }, confirmDiscard });
        await choose('license', 'CC0-1.0');
        await button('Add Readme').trigger('click');
        await flushPromises();

        expect(confirmDiscard).toHaveBeenCalledTimes(1);
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(wrapper.emitted('addMarkdown')).toBeUndefined();
    });
});

describe('SettingsDialog README', () => {
    it('opens it in its viewer and in the editor from buttons', async () => {
        await render();
        await button('Open').trigger('click');
        await button('Edit').trigger('click');
        await flushPromises();

        expect(wrapper.emitted('openReadme')).toEqual([['README.md']]);
        expect(wrapper.emitted('editReadme')).toEqual([['README.md']]);
    });

    it('offers Add Readme to a dataset that has none', async () => {
        await render({ root: { path: 'acme/site', properties: { meta: {} } } });
        expect(wrapper.text()).toContain('Add Readme');
        expect(button('Open')).toBeUndefined();
    });
});
