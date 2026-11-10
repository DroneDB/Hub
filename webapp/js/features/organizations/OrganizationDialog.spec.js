/**
 * The organization dialog (FR-ORG-04, FR-ORG-05, FR-ORG-14, FR-XC-11, D-046, D-047): the slug (the URL) is made from the
 * name, with the accents transliterated, and edited by the user; a name the Registry refuses is explained at the field;
 * a slug of the loaded list sends no request; a refusal of the Registry shows at the field its `errors` names, and the
 * dialog stays open with what was typed; the name and the description have the Registry's limits, with a counter.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import OrganizationDialog from './OrganizationDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

const WindowStub = {
    props: ['busy', 'confirmLabel', 'title'],
    emits: ['confirm', 'close'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-confirm :disabled="busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

let wrapper;
const save = vi.fn();
async function render(props = {}) {
    wrapper = mount(OrganizationDialog, {
        props: { mode: 'new', save, forbiddenSlugs: ['survey-team', 'acme'], ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
}
const field = name => wrapper.find(`[name="${name}"]`);
const type = async (name, value) => { await field(name).setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const nameError = () => wrapper.find('#organization-dialog-name-error');
const slugError = () => wrapper.find('#organization-dialog-slug-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; save.mockReset(); });

const NO_LATIN = 'Use at least one Latin letter (a–z) or digit in the name, or enter a slug';

describe('OrganizationDialog (new)', () => {
    it('is neutral when it opens, Create enabled, with the slug rule and the counters as help', async () => {
        await render();
        expect(wrapper.find('[data-confirm]').text()).toBe('Create');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        expect(nameError().exists()).toBe(false);
        expect(slugError().exists()).toBe(false);
        expect(wrapper.find('#organization-dialog-slug-help').text()).toContain("2 to 128 characters (lowercase letters, digits, '_' and '-')");
        expect(wrapper.find('#organization-dialog-name-count').text()).toBe('0/256');
        expect(wrapper.find('#organization-dialog-description-count').text()).toBe('0/2000');
    });

    // FR-ORG-05: accents are transliterated and the slug it will use is shown, editable
    it('shows the slug that the name gives, with the accents transliterated, and the URL it makes', async () => {
        await render();
        await type('name', 't-orgs Équipe Été');
        expect(field('slug').element.value).toBe('t-orgs-equipe-ete');
        expect(wrapper.find('#organization-dialog-slug-help').text()).toContain('/r/t-orgs-equipe-ete');
        await type('name', 'Ørsted Café Ü');
        expect(field('slug').element.value).toBe('orsted-cafe-u');
    });

    it('lets the user edit the slug, which then no longer follows the name', async () => {
        await render();
        await type('name', 'Roof Team');
        await type('slug', 'my-roof');
        await type('name', 'Roof Team 2');
        expect(field('slug').element.value).toBe('my-roof');
        save.mockResolvedValue(undefined);
        await confirm();
        expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Roof Team 2', slug: 'my-roof', description: '', isPublic: false });
    });

    it('lets the slug follow the name again once the user empties it', async () => {
        await render();
        await type('name', 'Roof Team');
        await type('slug', 'my-roof');
        await type('slug', '');
        await type('name', 'Roof Team 2');
        expect(field('slug').element.value).toBe('roof-team-2');
        save.mockResolvedValue(undefined);
        await confirm();
        expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Roof Team 2', slug: 'roof-team-2', description: '', isPublic: false });
    });

    // FR-ORG-05: '!!!@@@###' was silent
    it('explains at the name field why a name with no Latin letter or digit is refused, and sends nothing', async () => {
        await render();
        await type('name', '!!!@@@###');
        expect(nameError().text()).toBe(NO_LATIN);
        expect(field('slug').element.value).toBe('');
        await confirm();
        expect(save).not.toHaveBeenCalled();
        expect(nameError().text()).toBe(NO_LATIN);
        expect(field('name').attributes('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(field('name').element);
        // the slug field does not say it twice
        expect(slugError().exists()).toBe(false);
    });

    it('accepts a name in another script with a slug the user enters (D-035)', async () => {
        save.mockResolvedValue(undefined);
        await render();
        await type('name', 'Москва');
        expect(nameError().text()).toBe(NO_LATIN);
        await type('slug', 'moskva');
        expect(nameError().exists()).toBe(false);
        await confirm();
        expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Москва', slug: 'moskva', description: '', isPublic: false });
        expect(wrapper.emitted('close')).toEqual([['saved']]);
    });

    // FR-ORG-04: the dialog closed and the input was lost
    it('shows a duplicate organization at the slug field, with the typed name, and sends no request', async () => {
        await render();
        await type('name', 'Survey Team');
        expect(slugError().text()).toBe('An organization with this slug already exists');
        await confirm();
        expect(save).not.toHaveBeenCalled();
        expect(slugError().text()).toBe('An organization with this slug already exists');
        expect(field('slug').attributes('aria-invalid')).toBe('true');
        expect(field('name').element.value).toBe('Survey Team');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(document.activeElement).toBe(field('slug').element);
    });

    it('shows an error the Registry names at that field, and keeps the dialog open with the typed values', async () => {
        await render({ forbiddenSlugs: [] });
        await type('name', 'Private One');
        await type('description', 'Typed text');
        save.mockRejectedValueOnce(new ApiError('The organization already exists', 409, { errors: { slug: ['The organization already exists'] } }));
        await confirm();
        expect(save).toHaveBeenCalledTimes(1);
        expect(slugError().text()).toBe('The organization already exists');
        expect(field('name').element.value).toBe('Private One');
        expect(field('description').element.value).toBe('Typed text');
        expect(wrapper.emitted('close')).toBeUndefined();

        // The error clears with the edit of its field; the next answer shows where it belongs
        await type('slug', 'private-two');
        expect(slugError().exists()).toBe(false);
        save.mockRejectedValueOnce(new ApiError('Invalid', 400, { errors: { Name: ['The name is too long: use 1 to 256 characters'] } }));
        await confirm();
        expect(nameError().text()).toBe('The name is too long: use 1 to 256 characters');
    });

    it('shows a 409 without a member at the slug field, the unique one', async () => {
        await render({ forbiddenSlugs: [] });
        await type('name', 'Late Team');
        save.mockRejectedValueOnce(new ApiError('The organization already exists', 409));
        await confirm();
        expect(slugError().text()).toBe('The organization already exists');
        expect(wrapper.find('.form-error').exists()).toBe(false);
    });

    it('says an error that names no field in the dialog, and keeps it open', async () => {
        await render({ forbiddenSlugs: [] });
        await type('name', 'Down Team');
        save.mockRejectedValueOnce(new ApiError('Internal server error', 500));
        await confirm();
        expect(wrapper.find('.form-error').text()).toBe('Internal server error');
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    // FR-ORG-14
    it("limits the name to 256 characters and the description to 2000, with a counter and the Registry's text", async () => {
        await render();
        expect(field('name').attributes('maxlength')).toBe('256');
        expect(field('description').attributes('maxlength')).toBe('2000');
        await type('name', 'n'.repeat(250));
        await type('description', 'd'.repeat(1999));
        expect(wrapper.find('#organization-dialog-name-count').text()).toBe('250/256');
        expect(wrapper.find('#organization-dialog-description-count').text()).toBe('1999/2000');
        // 250 characters make a slug within the limit that does not end with a dash
        expect(field('slug').element.value).toHaveLength(128);
        expect(field('slug').element.value).toBe('n'.repeat(128));
    });

    it('sends Public as chosen', async () => {
        save.mockResolvedValue(undefined);
        await render({ forbiddenSlugs: [] });
        await type('name', 'Open Team');
        await wrapper.find('#orgPublic').setValue(true);
        await confirm();
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ slug: 'open-team', isPublic: true }));
    });
});

describe('OrganizationDialog (edit)', () => {
    const model = { slug: 'acme', name: 'Acme', description: 'Anvils', isPublic: true };

    it('keeps the slug: no slug field, the name and the description as they are, Save', async () => {
        await render({ mode: 'edit', model });
        expect(wrapper.find('[data-confirm]').text()).toBe('Save');
        expect(wrapper.find('#organization-dialog-slug').exists()).toBe(false);
        expect(field('name').element.value).toBe('Acme');
        expect(field('description').element.value).toBe('Anvils');
        save.mockResolvedValue(undefined);
        await type('name', 'Acme Corp');
        await confirm();
        expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Acme Corp', slug: 'acme', description: 'Anvils', isPublic: true });
    });

    // D-035: the organization keeps its slug, so an edit is never refused for a name with no Latin letter or digit
    it('does not refuse a name with no Latin letter or digit on an edit', async () => {
        await render({ mode: 'edit', model });
        save.mockResolvedValue(undefined);
        await type('name', 'Москва');
        expect(nameError().exists()).toBe(false);
        await confirm();
        expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Москва', slug: 'acme', description: 'Anvils', isPublic: true });
    });

    it('refuses an empty name', async () => {
        await render({ mode: 'edit', model });
        await type('name', '  ');
        await confirm();
        expect(nameError().text()).toBe('Enter a name');
        expect(save).not.toHaveBeenCalled();
    });
});
