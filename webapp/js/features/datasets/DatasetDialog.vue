<template>
    <Window id="datasetDialog" :title="title" modal size-class="dialog-lg" fixed-size :confirm-label="isNew ? 'Create' : 'Save'" :busy="busy" @confirm="submitForm()" @close="onWindowClose">
        <div>
            <Form ref="formRef" class="me-2" :resolver="resolver" :initial-values="initialValues" @submit="submit(saveDataset, $event)">
                <template #default="$form">
                    <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>

                    <div class="row g-3">
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label for="dataset-dialog-dataset-name" class="d-block mb-1 fw-semibold">Dataset Name</label>
                                <InputText id="dataset-dialog-dataset-name" name="name" placeholder="Dataset Name" autocomplete="off"
                                           class="w-100" :maxlength="nameMaxLength" :readonly="busy" :invalid="!!errorOf($form, 'name')"
                                           :aria-invalid="errorOf($form, 'name') ? 'true' : undefined"
                                           :aria-describedby="describedBy('dataset-dialog-name', errorOf($form, 'name'), 'count')" />
                                <!-- The Registry's rule text, at the field (D-035) -->
                                <FieldError id="dataset-dialog-name-error" :message="errorOf($form, 'name')" />
                                <small id="dataset-dialog-name-count" class="char-count">{{ lengthOf($form, 'name') }}/{{ nameMaxLength }}</small>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label id="dataset-dialog-visibility-label" for="dataset-dialog-visibility" class="d-block mb-1 fw-semibold">Visibility</label>
                                <Select v-model="visibility" input-id="dataset-dialog-visibility" aria-labelledby="dataset-dialog-visibility-label" :options="visibilityOptions" option-label="label" option-value="value" placeholder="Select visibility" class="w-100" :disabled="busy" />
                            </div>
                        </div>
                    </div>
                    <!-- A new dataset has its slug, the URL, made from the name and editable (FR-ORG-05); it is what must be unique -->
                    <div v-if="isNew" class="mb-3">
                        <label for="dataset-dialog-new-slug" class="d-block mb-1 fw-semibold">Dataset Slug</label>
                        <InputText id="dataset-dialog-new-slug" name="slug" class="w-100" placeholder="dataset-slug" autocomplete="off" spellcheck="false"
                                   :readonly="busy" :invalid="!!errorOf($form, 'slug')"
                                   :aria-invalid="errorOf($form, 'slug') ? 'true' : undefined"
                                   :aria-describedby="describedBy('dataset-dialog-new-slug', errorOf($form, 'slug'), 'help')"
                                   @input="onSlugInput" />
                        <FieldError id="dataset-dialog-new-slug-error" :message="errorOf($form, 'slug')" />
                        <small id="dataset-dialog-new-slug-help" class="d-block text-muted">The dataset will be at /r/{{ orgSlug || '&lt;organization&gt;' }}/{{ $form.slug?.value || '…' }}. A slug: {{ slugRuleText }}</small>
                    </div>
                    <!-- Editing keeps the URL: the name is the display name only, unless the user asks for a new slug (FR-ORG-08) -->
                    <div v-else class="mb-3">
                        <span class="d-block mb-1 fw-semibold">Dataset Slug</span>
                        <PrimeMessage severity="info" :closable="false">
                            <small>{{ model.slug }}</small>
                        </PrimeMessage>
                        <div class="d-flex align-items-center gap-2 mt-2">
                            <Checkbox v-model="changeSlug" :binary="true" :disabled="busy" input-id="dataset-dialog-change-slug" />
                            <label for="dataset-dialog-change-slug">Change URL (slug)</label>
                        </div>
                        <div v-if="changeSlug" class="mt-2">
                            <PrimeMessage severity="warn" :closable="false" class="mb-2">
                                {{ slugChangeWarning }}
                            </PrimeMessage>
                            <label for="dataset-dialog-slug" class="d-block mb-1 fw-semibold">New slug</label>
                            <InputText id="dataset-dialog-slug" name="slug" class="w-100" autocomplete="off" spellcheck="false"
                                       :readonly="busy" :invalid="!!errorOf($form, 'slug')"
                                       :aria-invalid="errorOf($form, 'slug') ? 'true' : undefined"
                                       :aria-describedby="describedBy('dataset-dialog-slug', errorOf($form, 'slug'), 'help')" />
                            <FieldError id="dataset-dialog-slug-error" :message="errorOf($form, 'slug')" />
                            <small id="dataset-dialog-slug-help" class="d-block text-muted">A slug: {{ slugRuleText }}</small>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="dataset-dialog-tagline" class="d-block mb-1 fw-semibold">Tagline</label>
                        <!-- The counter under the field gives the limit: a placeholder that names it is cut on a phone -->
                        <InputText id="dataset-dialog-tagline" name="tagline" :maxlength="taglineMaxLength" :readonly="busy"
                                   placeholder="A short description" class="w-100"
                                   aria-describedby="dataset-dialog-tagline-count" />
                        <small id="dataset-dialog-tagline-count" class="char-count">{{ lengthOf($form, 'tagline') }}/{{ taglineMaxLength }}</small>
                    </div>
                </template>
            </Form>
            <div v-if="isNew" class="mb-3">
                <div class="d-flex align-items-center gap-2">
                    <Checkbox v-model="openAfterCreate" :binary="true" :disabled="busy" input-id="openAfterCreate" />
                    <label for="openAfterCreate">Open dataset after creation</label>
                </div>
            </div>
        </div>
    </Window>
</template>

<script>
import { ref, watch } from 'vue';
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Checkbox from 'primevue/checkbox';
import FieldError from '@/components/FieldError.vue';
import { createResolver } from '@/libs/forms/resolver';
import { useHubForm } from '@/composables/useHubForm';
import { getOpenAfterCreatePreference, saveOpenAfterCreatePreference } from '@/libs/storageUtils';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY } from '@/libs/visibility';
import { TAGLINE_MAX_LENGTH } from '@/libs/constants';
import { slugProblem, slugDescription, suggestSlug } from '@/libs/slug';
import { latinNameProblem, displayNameLimits, displayNameLengthProblem } from '@/libs/nameRules';

const SLUG_TAKEN = 'A dataset with this slug already exists in this organization.';

/**
 * DatasetDialog - create or edit a dataset (FR-ORG-04, FR-ORG-05, FR-ORG-08, D-046).
 *
 * A new dataset has a name and a slug (its URL), made from the name until the user edits it (and
 * again once the user empties it). An edit keeps the slug unless the user ticks Change URL. The
 * submit stays enabled: a submit checks every field, shows the errors at the fields and sends no
 * request while one is invalid (a slug of the loaded list included).
 *
 * The request runs in the dialog (`save`): a refusal of the Registry shows at the field its
 * `errors` member names (`name`, `slug`, D-047) or, for a 409 with none, at the slug field (what
 * must be unique), else in the form-level message; the dialog stays open with what was typed. It
 * closes only when the dataset is saved.
 *
 * Props:
 *   mode           - 'new' or 'edit'
 *   model          - the dataset of an edit ({ slug, name, visibility, tagline })
 *   save           - async ({ name, slug, visibility, tagline, changeSlug, openAfterCreate }) => ...; throws when it fails
 *   forbiddenSlugs - the slugs of the datasets of the organization (the loaded list)
 *   orgSlug        - the organization, for the URL the slug makes
 */
export default {
    components: {
        Window, Select, InputText, PrimeMessage, Checkbox, Form, FieldError
    },
    props: {
        mode: {
            type: String,
            default: 'new'
        },
        model: {
            type: Object,
            default: null
        },
        save: {
            type: Function,
            required: true
        },
        forbiddenSlugs: {
            default: () => [],
            type: Array,
            required: false
        },
        // The organization, for the links a new slug breaks
        orgSlug: {
            type: String,
            default: ''
        }
    },
    emits: ['close'],

    setup(props) {
        const isNew = props.mode !== 'edit';
        // Edit only: the user asked for a new slug (the URL changes)
        const changeSlug = ref(false);
        const hasSlugField = () => isNew || changeSlug.value;

        const resolver = createResolver(() => ({
            name: (value, values) => {
                if (typeof value !== 'string' || value.trim() === '') return 'Enter a name';
                return displayNameLengthProblem(value)
                    // A new name needs a Latin letter or digit, or a slug the user enters (D-035); an edit is never refused
                    // for it (the dataset keeps its slug)
                    || (isNew ? latinNameProblem(value, { slug: values.slug, withSlugField: true }) : null);
            },
            slug: (value, values) => {
                if (!hasSlugField()) return null;
                const slug = typeof value === 'string' ? value.trim() : '';
                if (slug === '') {
                    // A name with no Latin letter says "enter a slug" at its own field
                    return isNew && latinNameProblem(values.name, { withSlugField: true }) ? null : 'Enter a slug';
                }
                // The slug the edited dataset has is its own
                const forbidden = isNew ? props.forbiddenSlugs : props.forbiddenSlugs.filter(s => s !== props.model?.slug);
                return slugProblem(slug, { kind: 'Dataset', forbidden, taken: SLUG_TAKEN });
            }
        }));
        const form = useHubForm({
            fields: ['name', 'slug', 'tagline'],
            // The slug is what must be unique: a duplicate the Registry finds without naming a field shows at the slug
            statusFields: { 409: 'slug' },
            // A slug that now holds a Latin letter makes the name valid (D-035)
            dependents: { slug: ['name'] }
        });

        // The slug of a new dataset follows its name (accents dropped, as the Registry makes it) until the user edits it
        const slugEdited = ref(false);
        if (isNew) {
            watch(() => form.formRef.value?.states?.name?.value, name => {
                if (slugEdited.value || !form.formRef.value) return;
                form.formRef.value.setFieldValue('slug', suggestSlug(name));
            });
        }
        return { ...form, resolver, isNew, changeSlug, slugEdited };
    },

    data() {
        const openAfterCreate = getOpenAfterCreatePreference();
        const edit = this.mode === 'edit';
        return {
            visibility: edit && this.model?.visibility !== undefined ? this.model.visibility : DEFAULT_VISIBILITY,
            taglineMaxLength: TAGLINE_MAX_LENGTH,
            openAfterCreate,
            // What the checkbox started from: the preference is stored only when the user changed it,
            // so a value that changed elsewhere since the dialog opened is not overwritten
            openAfterCreateAtOpen: openAfterCreate,
            visibilityOptions: VISIBILITY_OPTIONS
        };
    },
    computed: {
        title() {
            return this.isNew ? 'Create dataset' : `Edit ${this.model?.name || this.model?.slug}`;
        },
        initialValues() {
            return this.isNew
                ? { name: '', slug: '', tagline: '' }
                : { name: this.model?.name ?? '', slug: this.model?.slug ?? '', tagline: this.model?.tagline || '' };
        },
        slugChangeWarning() {
            return `Links to /r/${this.orgSlug || '<organization>'}/${this.model?.slug} will stop working`;
        },
        slugRuleText() {
            return slugDescription();
        },
        nameMaxLength() {
            return displayNameLimits().max;
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
        async saveDataset(values) {
            const slug = this.isNew || this.changeSlug ? (values.slug ?? '').trim() : this.model.slug;
            await this.save({
                name: values.name.trim(),
                visibility: this.visibility,
                slug,
                // Edit: only then does the page rename the dataset
                changeSlug: !this.isNew && this.changeSlug && slug !== this.model.slug,
                openAfterCreate: this.openAfterCreate,
                tagline: values.tagline || ''
            });
            if (this.isNew && this.openAfterCreate !== this.openAfterCreateAtOpen) {
                saveOpenAfterCreatePreference(this.openAfterCreate);
            }
            this.$emit('close', this.isNew ? 'create' : 'save');
        }
    }
}
</script>
