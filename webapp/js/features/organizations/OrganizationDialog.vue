<template>
    <Window id="organizationDialog" :title="title" modal size-class="dialog-lg" fixed-size :confirm-label="isNew ? 'Create' : 'Save'" :busy="busy" @confirm="submitForm()" @close="onWindowClose">
        <Form ref="formRef" :resolver="resolver" :initial-values="initialValues" @submit="submit(saveOrganization, $event)">
            <template #default="$form">
                <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>
                <div class="mb-3">
                    <label for="organization-dialog-name" class="d-block mb-1 fw-semibold">Name</label>
                    <InputText id="organization-dialog-name" name="name" placeholder="Name" autocomplete="off"
                               class="w-100" :maxlength="nameMax" :readonly="busy" :invalid="!!errorOf($form, 'name')"
                               :aria-invalid="errorOf($form, 'name') ? 'true' : undefined"
                               :aria-describedby="describedBy('organization-dialog-name', errorOf($form, 'name'), 'count')" />
                    <!-- The Registry's rule text, at the field (D-035, FR-ORG-05) -->
                    <FieldError id="organization-dialog-name-error" :message="errorOf($form, 'name')" />
                    <small id="organization-dialog-name-count" class="char-count">{{ lengthOf($form, 'name') }}/{{ nameMax }}</small>
                </div>
                <!-- A new organization has its slug, the URL, made from the name and editable (FR-ORG-05); an edit keeps it -->
                <div v-if="isNew" class="mb-3">
                    <label for="organization-dialog-slug" class="d-block mb-1 fw-semibold">URL (slug)</label>
                    <InputText id="organization-dialog-slug" name="slug" placeholder="organization-slug" autocomplete="off" spellcheck="false"
                               class="w-100" :readonly="busy" :invalid="!!errorOf($form, 'slug')"
                               :aria-invalid="errorOf($form, 'slug') ? 'true' : undefined"
                               :aria-describedby="describedBy('organization-dialog-slug', errorOf($form, 'slug'), 'help')"
                               @input="onSlugInput" />
                    <FieldError id="organization-dialog-slug-error" :message="errorOf($form, 'slug')" />
                    <small id="organization-dialog-slug-help" class="d-block text-muted">The organization will be at /r/{{ $form.slug?.value || '…' }}. Slug: {{ slugRule }}</small>
                </div>
                <div class="mb-3">
                    <label for="organization-dialog-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="organization-dialog-description" name="description" placeholder="Description" rows="3" auto-resize
                              class="w-100" :maxlength="descriptionMax" :readonly="busy" :invalid="!!errorOf($form, 'description')"
                              :aria-invalid="errorOf($form, 'description') ? 'true' : undefined"
                              :aria-describedby="describedBy('organization-dialog-description', errorOf($form, 'description'), 'count')" />
                    <FieldError id="organization-dialog-description-error" :message="errorOf($form, 'description')" />
                    <small id="organization-dialog-description-count" class="char-count">{{ lengthOf($form, 'description') }}/{{ descriptionMax }}</small>
                </div>
                <div class="d-flex align-items-center gap-2 mt-2">
                    <Checkbox v-model="isPublic" :binary="true" :disabled="busy" input-id="orgPublic" :pt="{ input: { 'aria-describedby': 'organization-dialog-public-hint' } }" />
                    <label for="orgPublic" class="mb-0" style="cursor: pointer;">Public</label>
                </div>
                <!-- What Public means (D-003): readable and listed for everyone -->
                <small id="organization-dialog-public-hint" class="d-block text-muted mt-1">Anyone, signed in or not, can see this organization and its public datasets.</small>
            </template>
        </Form>
    </Window>
</template>

<script>
import { ref, watch } from 'vue';
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import PrimeMessage from 'primevue/message';
import FieldError from '@/components/FieldError.vue';
import { createResolver } from '@/libs/forms/resolver';
import { slugProblem, slugDescription, suggestSlug } from '@/libs/slug';
import { latinNameProblem, displayNameLimits, displayNameLengthProblem, descriptionMaxLength, descriptionLengthProblem } from '@/libs/nameRules';
import { useHubForm } from '@/composables/useHubForm';

/**
 * OrganizationDialog - create or edit an organization (FR-ORG-04, FR-ORG-05, FR-ORG-14).
 *
 * A new organization has a name and a slug (its URL). The slug is made from the name (accents
 * dropped, `libs/slug.js`, the Registry's own generator) until the user edits it, and is what must
 * be unique: a slug of the loaded organizations is refused at the slug field, with no request (the
 * slug is not made unique by itself: 'Survey Team' says that survey-team exists). A
 * name that has no Latin letter or digit needs a slug the user enters (D-035). The name and the
 * description have the Registry's length limits, with a counter.
 *
 * The request runs in the dialog (`save`): a refusal of the Registry shows at the field its
 * `errors` member names (`name`, `slug`, `description`, D-047), and the dialog stays open with
 * what was typed. It closes only when the organization is saved.
 *
 * Props:
 *   mode           - 'new' or 'edit'
 *   model          - the organization of an edit
 *   save           - async ({ name, slug, description, isPublic }) => ...; throws when the request fails
 *   forbiddenSlugs - the slugs of the organizations that exist (the loaded list)
 */
export default {
    components: {
        Window, Checkbox, InputText, Textarea, Form, FieldError, PrimeMessage
    },

    props: {
        mode: { type: String, required: true },
        model: { type: Object, default: null },
        save: { type: Function, required: true },
        forbiddenSlugs: { type: Array, default: () => [] }
    },
    emits: ['close'],

    setup(props) {
        const isNew = props.mode !== 'edit';
        const resolver = createResolver(() => ({
            name: (value, values) => {
                if (typeof value !== 'string' || value.trim() === '') return 'Enter a name';
                return displayNameLengthProblem(value)
                    // A new name needs a Latin letter or digit, or a slug the user enters (D-035); an edit is never refused
                    // for it (the organization keeps its slug)
                    || (isNew ? latinNameProblem(value, { slug: values.slug, withSlugField: true }) : null);
            },
            ...(isNew ? {
                slug: (value, values) => {
                    if (typeof value !== 'string' || value.trim() === '') {
                        // A name with no Latin letter says "enter a slug" at its own field
                        return latinNameProblem(values.name, { withSlugField: true }) ? null : 'Enter a slug';
                    }
                    return slugProblem(value, { kind: 'Organization', forbidden: props.forbiddenSlugs, taken: 'An organization with this slug already exists' });
                }
            } : {}),
            description: value => descriptionLengthProblem(value)
        }));
        const form = useHubForm({
            fields: isNew ? ['name', 'slug', 'description'] : ['name', 'description'],
            // The slug is what must be unique: a duplicate the Registry finds answers 409 at the slug
            statusFields: isNew ? { 409: 'slug' } : {},
            // A slug that now holds a Latin letter makes the name valid (D-035)
            dependents: { slug: ['name'] }
        });

        // The slug follows the name until the user edits it, and again once the user empties it
        const slugEdited = ref(false);
        if (isNew) {
            watch(() => form.formRef.value?.states?.name?.value, name => {
                if (slugEdited.value || !form.formRef.value) return;
                form.formRef.value.setFieldValue('slug', suggestSlug(name));
            });
        }

        return { ...form, resolver, isNew, slugEdited };
    },

    data() {
        const edit = this.mode === 'edit';
        return {
            isPublic: edit ? !!this.model?.isPublic : false
        };
    },
    computed: {
        title() {
            return this.isNew ? 'Create organization' : `Edit ${this.model?.name || this.model?.slug}`;
        },
        initialValues() {
            return this.isNew
                ? { name: '', slug: '', description: '' }
                : { name: this.model?.name ?? '', description: this.model?.description ?? '' };
        },
        nameMax() {
            return displayNameLimits().max;
        },
        descriptionMax() {
            return descriptionMaxLength();
        },
        slugRule() {
            return slugDescription();
        }
    },
    methods: {
        describedBy(id, error, extra) {
            return [error ? `${id}-error` : '', `${id}-${extra}`].filter(Boolean).join(' ');
        },
        lengthOf($form, name) {
            return ($form[name]?.value ?? '').length;
        },
        /** A slug the user typed stops following the name; an emptied one follows it again. */
        onSlugInput(event) {
            this.slugEdited = (event?.target?.value ?? '') !== '';
        },
        onWindowClose() {
            if (this.busy) return;
            this.$emit('close', 'close');
        },
        async saveOrganization(values) {
            await this.save({
                name: values.name.trim(),
                slug: this.isNew ? values.slug.trim() : this.model?.slug,
                description: (values.description ?? '').trim() === '' ? '' : values.description,
                isPublic: this.isPublic
            });
            this.$emit('close', 'saved');
        }
    }
}
</script>

<style scoped>
.char-count {
    display: block;
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
    text-align: right;
}
</style>
