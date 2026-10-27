<template>
    <section v-if="emailEnabled" class="email-templates-card" aria-labelledby="email-templates-title">
        <h2 id="email-templates-title">E-mail templates</h2>

        <p v-if="loadError" class="card-note">The e-mail templates could not be loaded.</p>

        <div v-if="templates.length > 1" class="card-field">
            <label id="email-template-name-label" for="email-template-name">Template</label>
            <Select :model-value="selectedName" input-id="email-template-name" aria-labelledby="email-template-name-label"
                    :options="templates" option-label="title" option-value="name" :disabled="busy"
                    @update:model-value="selectTemplate" />
        </div>

        <template v-if="template">
            <h3 v-if="templates.length <= 1" class="template-title">
                {{ template.title }}
                <Tag v-if="template.isDefault" value="Default" severity="secondary" size="small" />
                <Tag v-else value="Custom" severity="warning" size="small" />
            </h3>

            <div class="card-field">
                <label for="email-template-subject">Subject</label>
                <InputText id="email-template-subject" ref="subjectInput" v-model="subject" :disabled="busy"
                           @focus="focusedField = 'subject'" />
            </div>

            <div class="card-field">
                <label for="email-template-body">Body</label>
                <Textarea id="email-template-body" ref="bodyInput" v-model="body" rows="12" class="template-body"
                          :disabled="busy" aria-describedby="email-template-body-hint" @focus="focusedField = 'body'" />
                <small id="email-template-body-hint">
                    Plain text: a blank line starts a paragraph. The server escapes every value and adds the logo and the footer.
                </small>
            </div>

            <div class="card-field">
                <span id="email-template-placeholders-label" class="field-label">
                    Insert in the {{ focusedField === 'subject' ? 'subject' : 'body' }}
                </span>
                <div class="placeholder-chips" role="group" aria-labelledby="email-template-placeholders-label">
                    <!-- mousedown.prevent: the field keeps the focus and the cursor the chip inserts at -->
                    <Button v-for="placeholder in template.placeholders" :key="placeholder.name"
                            :label="token(placeholder.name)" :title="placeholder.description"
                            :disabled="busy || !allowedHere(placeholder)"
                            severity="secondary" size="small" outlined class="placeholder-chip"
                            @mousedown.prevent @click="insert(placeholder.name)" />
                </div>
            </div>

            <PrimeMessage v-if="problem" severity="error" :closable="true" class="template-problem" @close="problem = ''">
                {{ problem }}
            </PrimeMessage>

            <div class="card-actions">
                <span v-if="dirty" class="unsaved me-auto" role="status">Unsaved changes</span>
                <Button label="Preview" icon="fa-solid fa-eye" severity="secondary" :disabled="busy" :loading="running === 'preview'"
                        @click="showPreview" />
                <Button label="Send me a test" icon="fa-solid fa-paper-plane" severity="secondary" :disabled="busy"
                        :loading="running === 'test'" @click="sendTest" />
                <Button label="Reset to default" icon="fa-solid fa-rotate-left" severity="secondary"
                        :disabled="busy || (template.isDefault && !dirty)" :loading="running === 'reset'" @click="resetToDefault" />
                <Button label="Save" icon="fa-solid fa-floppy-disk" :disabled="busy || !dirty" :loading="running === 'save'"
                        @click="save" />
            </div>

            <section v-if="preview" class="template-preview" aria-labelledby="email-template-preview-title">
                <div class="preview-header">
                    <h3 id="email-template-preview-title">Preview with sample builds</h3>
                    <Button label="Close preview" icon="fa-solid fa-xmark" severity="secondary" size="small" text
                            @click="preview = null" />
                </div>
                <p class="preview-subject"><strong>Subject:</strong> {{ preview.subject }}</p>
                <!-- An empty sandbox: the server's HTML runs no script and cannot reach this page -->
                <iframe class="preview-html" sandbox="" :srcdoc="preview.html" title="E-mail preview (HTML)" />
                <details>
                    <summary>Plain text version</summary>
                    <pre class="preview-text">{{ preview.text }}</pre>
                </details>
            </section>
        </template>

        <DialogHost :dialogs="dialogs" />
    </section>
</template>

<script setup>
/**
 * EmailTemplatesCard - the admin edits the subject and body of the e-mails the server lets
 * them change (today the build notifications), with {{placeholders}} for the values. The
 * server checks the text (an unknown or misplaced placeholder is a 400 that names it), renders
 * the preview with sample data through the real e-mail layout, sends a test to the admin and
 * keeps the built-in text as the default. Shown only on a server that sends e-mail.
 */
import { computed, nextTick, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import DialogHost from '@/components/DialogHost.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useDialogs } from '@/composables/useDialogs';
import { useNotify } from '@/composables/useNotify';
import reg from '@/libs/api/sharedRegistry';
import { isBadRequest } from '@/libs/ddb/apiError';
import { Features } from '@/libs/features';
import { useAuthStore } from '@/stores/auth';

defineOptions({ name: 'EmailTemplatesCard' });

/** @typedef {{ name: string, description: string, inSubject: boolean }} Placeholder */
/**
 * @typedef {{ name: string, title: string, subject: string, body: string, isDefault: boolean,
 *   defaultSubject: string, defaultBody: string, placeholders: Placeholder[] }} EmailTemplate
 */

const auth = useAuthStore();
const notify = useNotify();
const dialogs = useDialogs();
const confirm = useConfirm(dialogs);

const emailEnabled = computed(() => !!auth.feature(Features.EMAIL_ENABLED));

/** @type {import('vue').Ref<{ name: string, title: string }[]>} */
const templates = ref([]);
const selectedName = ref('');
/** The template as the server has it. @type {import('vue').Ref<EmailTemplate|null>} */
const template = ref(null);
const subject = ref('');
const body = ref('');
const loadError = ref(false);
/** The action in progress: 'load', 'preview', 'test', 'reset' or 'save'. */
const running = ref('');
/** The server's reason for refusing the text (a 400). */
const problem = ref('');
/** @type {import('vue').Ref<{ subject: string, text: string, html: string }|null>} */
const preview = ref(null);
/** The field the placeholder chips insert into: the last one focused. @type {import('vue').Ref<'subject'|'body'>} */
const focusedField = ref('body');
const subjectInput = ref(null);
const bodyInput = ref(null);

const busy = computed(() => running.value !== '');
const dirty = computed(() => !!template.value && (subject.value !== template.value.subject || body.value !== template.value.body));
const text = () => ({ subject: subject.value, body: body.value });

/** @param {string} name */
const token = name => `{{${name}}}`;
/** A block placeholder (the list of builds, a link) cannot go in the subject. @param {Placeholder} placeholder */
const allowedHere = placeholder => focusedField.value !== 'subject' || placeholder.inSubject;

/** The server's answer replaces the form (after a load, a save or a reset). @param {EmailTemplate} value */
function show(value) {
    template.value = value;
    subject.value = value.subject;
    body.value = value.body;
    problem.value = '';
}

/**
 * Runs one action at a time; a 400 shows the server's reason in the card, any other failure
 * as a notification. Returns whether it succeeded.
 * @param {string} action @param {() => Promise<void>} work
 */
async function run(action, work) {
    running.value = action;
    problem.value = '';
    try {
        await work();
        return true;
    } catch (e) {
        if (isBadRequest(e)) problem.value = e instanceof Error ? e.message : String(e);
        else notify.error(e);
        return false;
    } finally {
        running.value = '';
    }
}

/** @param {string} name */
async function loadTemplate(name) {
    selectedName.value = name;
    preview.value = null;
    await run('load', async () => show(await reg.sys.emailTemplate(name)));
}

async function loadTemplates() {
    loadError.value = false;
    try {
        templates.value = await reg.sys.emailTemplates();
    } catch (e) {
        console.warn('The e-mail templates could not be loaded', e);
        loadError.value = true;
        return;
    }
    if (templates.value.length) await loadTemplate(templates.value[0].name);
}

/** Another template: unsaved changes of this one are lost, so ask first. @param {string} name */
async function selectTemplate(name) {
    if (name === selectedName.value) return;
    if (dirty.value && !await confirm({
        title: 'Unsaved changes',
        message: 'The changes to this template are not saved. Open the other template anyway?',
        confirmText: 'Discard changes',
        danger: true
    })) return;
    await loadTemplate(name);
}

/** Puts `{{name}}` in place of the selection of the focused field, the cursor after it. @param {string} name */
async function insert(name) {
    const field = focusedField.value === 'subject' ? subject : body;
    const element = /** @type {HTMLInputElement|HTMLTextAreaElement|undefined} */ (
        /** @type {any} */ (focusedField.value === 'subject' ? subjectInput.value : bodyInput.value)?.$el);
    const value = field.value;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    const inserted = token(name);
    field.value = value.slice(0, start) + inserted + value.slice(end);
    await nextTick();
    element?.focus();
    element?.setSelectionRange(start + inserted.length, start + inserted.length);
}

function showPreview() {
    return run('preview', async () => {
        preview.value = await reg.sys.previewEmailTemplate(selectedName.value, text());
    });
}

async function sendTest() {
    if (await run('test', () => reg.sys.testEmailTemplate(selectedName.value, text()))) {
        notify.success('A test e-mail with sample builds was sent to your address.', { summary: 'Test e-mail sent' });
    }
}

async function resetToDefault() {
    const confirmed = await confirm({
        title: 'Reset to default',
        message: 'The template returns to the built-in subject and body. Your text is lost.',
        confirmText: 'Reset',
        danger: true
    });
    if (!confirmed) return;
    if (await run('reset', async () => show(await reg.sys.resetEmailTemplate(selectedName.value)))) {
        notify.success('E-mail template reset to the default');
    }
}

async function save() {
    if (!dirty.value) return;
    if (await run('save', async () => show(await reg.sys.saveEmailTemplate(selectedName.value, text())))) {
        notify.success('E-mail template saved');
    }
}

// The server sends e-mail (the flags may arrive after the page): read the templates once
watch(emailEnabled, enabled => {
    if (enabled && !templates.value.length) void loadTemplates();
}, { immediate: true });
</script>

<style scoped>
.email-templates-card {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-md);
    margin-top: 1rem;
    padding: var(--ddb-spacing-md);
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-md);
    max-width: 48rem;
}

h2 {
    margin: 0;
    font-size: var(--ddb-font-size-lg);
}

h3 {
    margin: 0;
    font-size: var(--ddb-font-size-base);
}

.template-title {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.card-note {
    margin: 0;
    color: var(--ddb-text-secondary);
    font-style: italic;
}

.card-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}

.card-field > label,
.field-label {
    font-weight: 600;
    font-size: 0.9rem;
}

.card-field small {
    color: var(--ddb-text-secondary);
}

.template-body {
    font-family: monospace;
    resize: vertical;
}

.placeholder-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-xs);
}

.placeholder-chip {
    font-family: monospace;
}

.card-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ddb-spacing-xs);
}

.unsaved {
    color: var(--ddb-warning-text);
    font-size: var(--ddb-font-size-sm);
}

.template-preview {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    padding-top: var(--ddb-spacing-md);
    border-top: 1px solid var(--ddb-border);
}

.preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ddb-spacing-xs);
}

.preview-subject {
    margin: 0;
    overflow-wrap: anywhere;
}

/* E-mails are laid out for white paper, whatever the Hub theme */
.preview-html {
    width: 100%;
    height: 32rem;
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: #fff;
}

.preview-text {
    margin: var(--ddb-spacing-xs) 0 0;
    padding: var(--ddb-spacing-sm);
    max-height: 20rem;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--ddb-bg-subtle);
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
}
</style>
