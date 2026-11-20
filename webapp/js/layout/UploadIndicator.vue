<template>
    <div v-if="auth.isLoggedIn && uploads.active" class="upload-indicator">
        <Button class="upload-indicator-button" severity="secondary" size="small" text
                :title="label" :aria-label="label" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
            <i class="fa-solid" :class="uploads.paused ? 'fa-circle-pause' : 'fa-cloud-arrow-up fa-beat-fade'" aria-hidden="true" />
            <span class="upload-left">{{ uploads.filesLeft }}</span>
            <span class="upload-percent d-none d-sm-inline">{{ percentText }}</span>
        </Button>

        <!-- The upload list: one row per dataset that is uploading -->
        <Popover ref="panel" @show="open = true" @hide="open = false">
            <div class="upload-list" role="region" aria-label="Uploads in progress">
                <div v-for="u in rows" :key="u.key" class="upload-row">
                    <div class="upload-row-head">
                        <RouterLink class="upload-row-name" :to="{ name: 'ViewDataset', params: { org: u.org, ds: u.ds } }"
                                    @click="panel.hide()">
                            {{ u.org }}/{{ u.ds }}
                        </RouterLink>
                        <span class="upload-row-state">
                            {{ countOf(u.left, 'file') }} left, {{ wholePercent(u.progress) }}<template v-if="u.paused">, paused</template>
                        </span>
                    </div>
                    <div class="upload-row-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                         :aria-valuenow="Math.round(u.progress)" :aria-label="'Upload to ' + u.org + '/' + u.ds">
                        <div class="upload-row-fill" :style="{ width: u.progress + '%' }" />
                    </div>
                    <div class="upload-row-actions">
                        <Button size="small" severity="secondary" text
                                :icon="u.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'" :label="u.paused ? 'Resume' : 'Pause'"
                                @click="togglePause(u)" />
                        <Button size="small" severity="danger" text icon="fa-regular fa-circle-stop" label="Cancel"
                                @click="cancel(u)" />
                    </div>
                </div>
            </div>
        </Popover>
    </div>
    <DialogHost :dialogs="dialogs" />
</template>

<script setup>
/**
 * UploadIndicator - the header's view of the uploads of the dataset page (FR-UPL-04). While an upload runs it shows the
 * number of files left and the total progress; it opens the upload list, a row for each dataset that is uploading, with
 * Pause/Resume and Cancel. An upload goes on when the user opens another page of the Hub, so the indicator is where
 * it stays visible; Cancel keeps the files already sent (D-045).
 *
 * The page-unload warning is here too (FR-XC-04): an upload that is not settled is unsaved work for a reload or a
 * closed tab, and never for a route change (`ignore` is always true: the guard asks nothing on a route change).
 *
 * Signed out it shows nothing: the uploads are the signed-in user's (the store drops them when the session ends).
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { useLeaveGuard } from '@/composables/useLeaveGuard';
import { useUploadsStore } from '@/stores/uploads';
import { useAuthStore } from '@/stores/auth';
import { countOf, formatNumber } from '@/libs/format';
import { cancelUploadQuestion } from '@/libs/upload/cancelQuestion';

defineOptions({ name: 'UploadIndicator' });

const uploads = useUploadsStore();
const auth = useAuthStore();
const dialogs = useDialogs();
const confirm = useConfirm(dialogs);

const open = ref(false);
const panel = ref(null);

useLeaveGuard({ isDirty: () => uploads.active, dialogs, ignore: () => true });

// Only the queues that have files left: a settled one is gone from the list
const rows = computed(() => uploads.uploads.filter(u => u.left > 0));

const wholePercent = value => `${formatNumber(Math.floor(value), 0)}%`;
const percentText = computed(() => wholePercent(uploads.progress));
const label = computed(() => `${uploads.paused ? 'Uploads paused' : 'Uploading'}: ${countOf(uploads.filesLeft, 'file')} left, ${percentText.value}. Show the upload list`);

function toggle(event) {
    panel.value?.toggle(event);
}

function togglePause(u) {
    if (u.paused) uploads.resume(u.org, u.ds);
    else uploads.pause(u.org, u.ds);
}

// FR-UPL-16: the question says what stays
async function cancel(u) {
    const ok = await confirm(cancelUploadQuestion({ sent: u.done, discardsBatch: false }));
    if (ok) await uploads.cancel(u.org, u.ds);
}
</script>

<style scoped>
.upload-indicator-button {
    display: inline-flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.upload-left,
.upload-percent {
    font-variant-numeric: tabular-nums;
}

.upload-percent {
    color: var(--ddb-text-secondary);
}

.upload-list {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-md);
    min-width: min(20rem, 80vw);
}

.upload-row-head {
    display: flex;
    justify-content: space-between;
    gap: var(--ddb-spacing-md);
    flex-wrap: wrap;
}

.upload-row-name {
    font-weight: 600;
    overflow-wrap: anywhere;
}

.upload-row-state {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
}

.upload-row-bar {
    height: 0.375rem;
    margin: var(--ddb-spacing-xs) 0;
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-border-separator);
    overflow: hidden;
}

.upload-row-fill {
    height: 100%;
    background: var(--ddb-primary);
}

.upload-row-actions {
    display: flex;
    gap: var(--ddb-spacing-xs);
}
</style>
