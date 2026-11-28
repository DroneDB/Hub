<template>
    <div class="mb-3 logo-field" role="group" aria-labelledby="organization-logo-label">
        <span id="organization-logo-label" class="d-block mb-1 fw-semibold">Logo</span>
        <div class="d-flex flex-wrap align-items-center gap-2">
            <OrgLogo :org="shown" size="lg" />
            <ActionButton severity="secondary" outlined size="small" icon="fa-solid fa-upload" show-label
                          :label="logoUrl ? 'Replace logo' : 'Upload logo'" :disabled="busy" :disabled-reason="BUSY_REASON"
                          @click="chooseFile" />
            <ActionButton v-if="logoUrl" severity="secondary" text size="small" icon="fa-solid fa-trash" show-label label="Remove logo"
                          :disabled="busy" :disabled-reason="BUSY_REASON" @click="removalOpen = true" />
        </div>
        <input ref="fileInput" type="file" hidden accept="image/*" aria-label="Logo file" @change="onFileChosen">
        <small v-if="busy" class="d-block mt-1 text-muted" role="status">Preparing and sending the logo…</small>
        <small class="d-block mt-1 text-muted">{{ LOGO_INPUT_HINT }}</small>
        <FieldError id="organization-logo-error" :message="error" />

        <ConfirmDialog v-if="removalOpen"
                       title="Remove the logo"
                       :message="`Remove the logo of <strong>${escapeHtml(name)}</strong>? The organization shows its initials in its place.`"
                       confirm-text="Remove" cancel-text="Cancel" confirm-button-class="danger" @close="onRemovalClose" />
    </div>
</template>

<script setup>
/**
 * OrganizationLogoField - the logo of an organization in its Edit dialog: the preview, Upload (Replace once it has
 * one) and Remove, which asks first. The logo is the Registry's own file of the organization, not a field of the
 * form: it is sent at once, not with Save, and `changed` carries the new address (null when removed) for the page
 * to show it. The file the user chooses is prepared in the browser first (libs/logoImage: shrunk and saved as WebP, an
 * SVG kept), and the toast says what was stored. A file that cannot be a logo (not an image, too big even shrunk) is
 * refused at the field before any request, and so is a refusal of the Registry (403, 413, 400) with its own message. The dialog shows the field only to whoever may change the logo.
 */
import { computed, ref } from 'vue';
import ActionButton from '@/components/ActionButton.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FieldError from '@/components/FieldError.vue';
import OrgLogo from '@/components/OrgLogo.vue';
import reg from '@/libs/api/sharedRegistry';
import { ORG_LOGO_BYTES, orgLogoProblem } from '@/libs/ddb/organizationsApi';
import { formMessageOf } from '@/libs/forms/serverErrors';
import { LOGO_INPUT_HINT, describeLogo, prepareLogoFor } from '@/libs/logoImage';
import { notify } from '@/libs/notify';
import { escapeHtml } from '@/libs/sanitize';

defineOptions({ name: 'OrganizationLogoField' });

const BUSY_REASON = 'A logo is being prepared and sent';

const props = defineProps({
    /** The organization: its slug, its name and the address of its logo (null without one) */
    org: { type: Object, required: true }
});
const emit = defineEmits({
    /** The logo changed: its new address, or null when it was removed */
    changed: logoUrl => logoUrl === null || typeof logoUrl === 'string'
});

const name = computed(() => props.org.name || props.org.slug);
const logoUrl = ref(props.org.logoUrl ?? null);
const shown = computed(() => ({ ...props.org, logoUrl: logoUrl.value }));
const busy = ref(false);
const error = ref('');
const removalOpen = ref(false);
const fileInput = ref(null);

function chooseFile() {
    error.value = '';
    fileInput.value?.click();
}

/** Runs a write of the logo: busy while it runs, its failure at the field. */
async function write(request, failure) {
    busy.value = true;
    error.value = '';
    try {
        return await request();
    } catch (e) {
        error.value = formMessageOf(e, failure);
        return undefined;
    } finally {
        busy.value = false;
    }
}

async function onFileChosen(event) {
    const input = event.target;
    const [file] = input.files ?? [];
    // Choosing the same file again must still fire a change
    input.value = '';
    if (!file) return;
    const sent = await write(async () => {
        // The file the user chose may be any image or too big: what is sent is the logo made from it, at most the limit
        const logo = await prepareLogoFor(file, { maxBytes: ORG_LOGO_BYTES, problemOf: orgLogoProblem });
        return { logo, answer: await reg.orgs.uploadLogo(props.org.slug, logo.file) };
    }, 'The logo was not saved');
    if (!sent) return;
    logoUrl.value = sent.answer?.logoUrl ?? null;
    emit('changed', logoUrl.value);
    notify.success(`Saved as ${describeLogo(sent.logo)}`, { summary: 'Logo saved' });
}

async function onRemovalClose(action) {
    removalOpen.value = false;
    if (action !== 'confirm') return;
    // A removal that succeeds answers nothing: its own marker tells it from a failure
    const done = await write(async () => { await reg.orgs.deleteLogo(props.org.slug); return true; }, 'The logo was not removed');
    if (!done) return;
    logoUrl.value = null;
    emit('changed', null);
    notify.success('Logo removed', { summary: 'Saved' });
}
</script>
