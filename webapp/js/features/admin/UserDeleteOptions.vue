<template>
    <!-- The choices of every delete of users: who takes the data over, what happens on a conflict, and what is lost (FR-ADM-17, FR-ADM-23) -->
    <div class="delete-options">
        <div class="field">
            <label id="users-transfer-data-to-successor-label" for="users-transfer-data-to-successor" class="d-block mb-1 fw-semibold">Transfer data to successor (optional)</label>
            <Select v-model="successor" input-id="users-transfer-data-to-successor" aria-labelledby="users-transfer-data-to-successor-label" :options="choices" option-label="label" option-value="value" placeholder="-- Delete all data --" show-clear class="w-100" />
            <small class="d-block mt-1 text-muted">{{ several ? 'If selected, all organizations and datasets of the deleted users will be transferred to this user.' : 'If selected, all organizations and datasets will be transferred to this user.' }}</small>
        </div>

        <div v-if="successor" class="field">
            <span id="users-conflict-label" class="d-block fw-semibold">Conflict Resolution Strategy</span>
            <div class="radio-group" role="radiogroup" aria-labelledby="users-conflict-label">
                <div class="radio-item">
                    <input id="conflict-rename" v-model="conflictResolution" type="radio" value="Rename">
                    <label for="conflict-rename">Rename conflicting datasets</label>
                </div>
                <div class="radio-item">
                    <input id="conflict-overwrite" v-model="conflictResolution" type="radio" value="Overwrite">
                    <label for="conflict-overwrite">Overwrite existing datasets</label>
                </div>
                <div class="radio-item">
                    <input id="conflict-halt" v-model="conflictResolution" type="radio" value="HaltOnConflict">
                    <label for="conflict-halt">Stop if conflict detected</label>
                </div>
            </div>
        </div>

        <PrimeMessage v-if="!successor" severity="warn" :closable="false">
            <i class="fa-solid fa-triangle-exclamation" />
            <strong>Warning:</strong> All user data (organizations, datasets, files) will be permanently deleted.
        </PrimeMessage>
        <PrimeMessage v-else severity="info" :closable="false">
            <i class="fa-solid fa-circle-info" />
            Organizations and datasets will be transferred to <strong>{{ successor }}</strong>.
        </PrimeMessage>
    </div>
</template>

<script setup>
import Select from 'primevue/select';
import PrimeMessage from 'primevue/message';

/**
 * UserDeleteOptions - the body of the question that deletes one user or several (UsersPage). The single delete and the
 * bulk delete show this one component, so they offer the same choices.
 *
 *   <UserDeleteOptions v-model:successor="successor" v-model:conflict-resolution="strategy" :choices="choices" :several="true" />
 *
 * `choices` are the users that can take the data over (libs/userBulk.js `successorChoices`).
 */
defineProps({
    choices: { type: Array, required: true },
    // Several users are deleted: the texts speak of the deleted users
    several: { type: Boolean, default: false }
});

// The user who takes the data over (null: it is all deleted), and what happens when a dataset of theirs has the same name
const successor = defineModel('successor', { type: String, default: null });
const conflictResolution = defineModel('conflictResolution', { type: String, default: 'Rename' });
</script>

<style scoped>
.delete-options .field {
    margin-bottom: 0.75rem;
}

.radio-group {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    margin-top: var(--ddb-spacing-xs);
}

.radio-item {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}
</style>
