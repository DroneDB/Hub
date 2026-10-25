<template>
    <section class="usage-contact-card" aria-labelledby="usage-contact-title">
        <h2 id="usage-contact-title">Usage and contact</h2>

        <p v-if="!updateCheckEnabled" class="card-note">
            The update check is turned off on this server, so these settings are not sent and have no effect.
        </p>
        <p v-else-if="error" class="card-note">
            The current settings could not be loaded.
        </p>

        <div class="card-field">
            <label id="usage-declaration-label" for="usage-declaration">How is this deployment used?</label>
            <Select v-model="declaration" input-id="usage-declaration" aria-labelledby="usage-declaration-label" :options="DECLARATIONS" option-label="label"
                    option-value="value" :disabled="inputsDisabled" />
            <small>This helps us understand how Registry is used. It changes nothing in the software.</small>
            <div v-if="links.licence" class="licence-link">
                <Button as="a" :href="links.licence" target="_blank" rel="noopener" label="Get a licence"
                        icon="fa-solid fa-key" severity="secondary" size="small" />
            </div>
        </div>

        <div class="card-field">
            <label for="usage-contact-email">Security and release news from DroneDB</label>
            <InputText id="usage-contact-email" v-model="email" type="email" autocomplete="email"
                       placeholder="Email address (optional)" :disabled="inputsDisabled" />
            <div class="consent">
                <Checkbox v-model="consent" input-id="usage-contact-consent" :binary="true"
                          :disabled="inputsDisabled || !hasEmail" />
                <label for="usage-contact-consent">{{ CONSENT_TEXT }}</label>
            </div>
        </div>

        <div class="card-actions">
            <Button label="Save" icon="fa-solid fa-floppy-disk" :disabled="!canSave" :loading="saving" @click="save" />
        </div>
    </section>
</template>

<script setup>
/**
 * UsageAndContactCard - the admin's optional statement of how this deployment is used and
 * an e-mail for security and release news, saved on the server with the update-check settings.
 * The e-mail needs the box ticked: the server refuses an address without consent.
 */
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import { useNotify } from '@/composables/useNotify';
import { useUpdateCheck, updateLinks } from '@/composables/useUpdateCheck';

defineOptions({ name: 'UsageAndContactCard' });

// The select cannot hold null, so "not stated" has a value of its own
const NOT_STATED = 'not_stated';
const DECLARATIONS = [
    { value: NOT_STATED, label: 'Not stated' },
    { value: 'personal', label: 'Personal or homelab use' },
    { value: 'nonprofit', label: 'Non-profit organisation' },
    { value: 'evaluation', label: 'Evaluation or trial' },
    { value: 'commercial_licensed', label: 'Commercial use, licensed' },
    { value: 'commercial_needs_license', label: 'Commercial use, I need a licence' }
];
const CONSENT_TEXT = 'Send security notices, release news and offers for self-hosted Registry from DroneDB to this address. You can unsubscribe at any time.';

const notify = useNotify();
// On the Configuration page the card is always shown; `enabled` says whether the server sends anything
const { updateInfo, loading, error, enabled: updateCheckEnabled, load, saveSettings } = useUpdateCheck();

const declaration = ref(NOT_STATED);
const email = ref('');
const consent = ref(false);
const saving = ref(false);

const hasEmail = computed(() => email.value.trim() !== '');
// Nothing to edit until the current values are known (saving the empty form would erase them), and nothing is sent
// when the check is off
const inputsDisabled = computed(() =>
    !updateCheckEnabled.value || loading.value || !updateInfo.value || !!error.value || saving.value);
const canSave = computed(() => !inputsDisabled.value && (!hasEmail.value || consent.value));
const links = computed(() => updateLinks(updateInfo.value));

// The saved values fill the form (also after a save: the server's answer replaces them)
watch(updateInfo, info => {
    declaration.value = info?.useDeclaration || NOT_STATED;
    email.value = info?.contactEmail || '';
    // A stored address always has the consent it was saved with
    consent.value = !!info?.contactEmail;
}, { immediate: true });

// The consent was given for the saved address: no address, or another one, needs it given again
watch(() => email.value.trim(), address => {
    if (!address || address !== (updateInfo.value?.contactEmail || '')) consent.value = false;
});

// The Configuration page is for admins who opened it on purpose: read the current values now
load({ ignoreGate: true, force: true });

async function save() {
    if (!canSave.value) return;
    saving.value = true;
    try {
        await saveSettings({
            useDeclaration: declaration.value === NOT_STATED ? null : declaration.value,
            contactEmail: hasEmail.value ? email.value.trim() : null,
            contactConsent: hasEmail.value && consent.value
        });
        notify.success('Usage and contact saved');
    } catch (e) {
        notify.error(e);
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
.usage-contact-card {
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

.card-field > label {
    font-weight: 600;
    font-size: 0.9rem;
}

.card-field small {
    color: var(--ddb-text-secondary);
}

.consent {
    display: flex;
    align-items: flex-start;
    gap: var(--ddb-spacing-xs);
    font-size: 0.9rem;
}

.licence-link {
    margin-top: var(--ddb-spacing-xs);
}

.card-actions {
    display: flex;
    justify-content: flex-end;
}
</style>
