<template>
    <!-- Its parts are the flex children of the container that holds it (the dialog, a page): no box of its own -->
    <div class="upload-queue-view">
        <div class="upload-header">
            <div class="upload-filters">
                <Button class="filter-btn filter-all" :class="{ active: filter === 'all' }" text
                        severity="secondary" @click="$emit('update:filter', 'all')">
                    <i class="fa-solid fa-file" />
                    <span class="filter-label">All</span>
                    <span class="filter-count">{{ counts.total }}</span>
                </Button>
                <Button v-if="!done || counts.error > 0" class="filter-btn filter-uploading" :class="{ active: filter === 'uploading' }" text
                        :severity="filter === 'uploading' ? undefined : 'secondary'" @click="$emit('update:filter', 'uploading')">
                    <i class="fa-solid fa-circle-notch" :class="{ 'fa-spin': counts.uploading + counts.processing > 0 }" />
                    <span class="filter-label">In Progress</span>
                    <span class="filter-count">{{ counts.uploading + counts.processing + counts.pending }}</span>
                </Button>
                <Button class="filter-btn filter-done" :class="{ active: filter === 'done' }" text
                        :severity="filter === 'done' ? 'success' : 'secondary'" @click="$emit('update:filter', 'done')">
                    <i class="fa-solid fa-check" />
                    <span class="filter-label">Done</span>
                    <span class="filter-count">{{ counts.done }}</span>
                </Button>
                <Button v-if="counts.error > 0" class="filter-btn filter-error" :class="{ active: filter === 'error', 'has-errors': counts.error > 0 }" text
                        :severity="filter === 'error' ? 'danger' : 'secondary'" @click="$emit('update:filter', 'error')">
                    <i class="fa-solid fa-xmark" />
                    <span class="filter-label">Errors</span>
                    <span class="filter-count">{{ counts.error }}</span>
                </Button>
            </div>
        </div>

        <div class="upload-body">
            <slot name="before-list" />
            <VirtualScroller
                v-slot="{ item }"
                class="file-list-scroller"
                :items="rows"
                :item-size="48"
            >
                <FileUploadRow :file="item" @retry="$emit('retry', $event)" />
            </VirtualScroller>
        </div>

        <div class="upload-footer">
            <div v-if="uploading" class="total-progress-container">
                <div class="progress-info">
                    <span>{{ humanBytesSent }} / {{ humanTotalBytes }}</span>
                    <span class="total-files">{{ filesOfTotal }}</span>
                    <span class="total-percent">{{ totalPercentText }}</span>
                </div>
                <div class="progress-speed-info">
                    <span><i class="fa-solid fa-gauge" /> {{ currentSpeedFormatted }}</span>
                    <span v-if="paused"><i class="fa-solid fa-circle-pause" /> Paused</span>
                    <span v-else-if="allSent && counts.processing > 0"><i class="fa-solid fa-gears" /> Processing on server...</span>
                    <span v-else><i class="fa-regular fa-clock" /> {{ etaFormatted }}</span>
                </div>
                <div class="total-progress-bar">
                    <div class="progress-fill" :style="{ width: totalProgress + '%' }" />
                </div>
            </div>

            <slot name="footer" />
        </div>
    </div>
</template>

<script>
import FileUploadRow from './FileUploadRow.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import Button from 'primevue/button';
import { bytesToSize } from '@/libs/utils';
import { countOf, formatNumber, formatDurationSeconds, PRECISION } from '@/libs/format';

const EMPTY_COUNTS = { total: 0, pending: 0, uploading: 0, processing: 0, done: 0, error: 0 };

/**
 * UploadQueueView - what an upload shows while its queue runs (FR-UPL-16): the filter bar (All, In Progress, Done, Errors,
 * each with its count), the list of every file with its status and its whole-number percentage (a VirtualScroller of
 * FileUploadRow), and the total: bytes sent, "x of y files", the percentage, the speed and the time left. The dataset
 * upload dialog and the /upload page show the same, from the snapshot of their useUploadQueue; each puts its own summary and
 * buttons in the `footer` slot.
 *
 * Props: `snapshot` (the queue's state), `rows` (the files to list: the filter's), `filter` (v-model:filter).
 */
export default {
    name: 'UploadQueueView',
    components: { FileUploadRow, VirtualScroller, Button },
    props: {
        snapshot: { type: Object, default: null },
        rows: { type: Array, default: () => [] },
        filter: { type: String, default: 'all' }
    },
    emits: ['update:filter', 'retry'],
    computed: {
        counts() {
            return this.snapshot?.counts ?? EMPTY_COUNTS;
        },
        done() {
            return this.counts.total > 0 && this.snapshot?.done === true;
        },
        uploading() {
            return this.counts.total > 0 && !this.done;
        },
        paused() {
            return this.snapshot?.paused === true;
        },
        // Every byte is sent: what is left is the server adding the files
        allSent() {
            return this.snapshot != null && this.snapshot.bytesSent >= this.snapshot.totalBytes;
        },
        humanTotalBytes() {
            return bytesToSize(this.snapshot?.totalBytes ?? 0);
        },
        humanBytesSent() {
            return bytesToSize(this.snapshot?.bytesSent ?? 0);
        },
        totalProgress() {
            const total = this.snapshot?.totalBytes ?? 0;
            return total === 0 ? 0 : (this.snapshot.bytesSent / total) * 100.0;
        },
        // A whole number, by the one number formatter (FR-XC-08)
        totalPercentText() {
            return `${formatNumber(this.totalProgress, PRECISION.count)}%`;
        },
        // "2 of 3 files": the files that are added of all the files
        filesOfTotal() {
            return `${formatNumber(this.counts.done, PRECISION.count)} of ${countOf(this.counts.total, 'file')}`;
        },
        currentSpeedFormatted() {
            const speed = this.snapshot?.speed ?? 0;
            return speed <= 0 ? '0 B/s' : bytesToSize(speed) + '/s';
        },
        etaFormatted() {
            const eta = this.snapshot?.eta;
            if (eta == null) return 'Calculating...';
            return eta < 1 ? '< 1s' : formatDurationSeconds(eta);
        }
    }
};
</script>

<style scoped>
/* No box: the header, the body and the footer are the flex children of the dialog or of the page that holds the view */
.upload-queue-view {
    display: contents;
}

/* Header */
.upload-header {
    flex-shrink: 0;
    padding: var(--ddb-spacing-md) 0;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.upload-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-xs);
}

.filter-btn {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    border: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg-surface);
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    font-size: var(--ddb-font-size-base);
    transition: all 0.2s;
}

.filter-btn:hover {
    background-color: var(--ddb-bg-hover);
}

.filter-btn .filter-count {
    background-color: var(--ddb-border-separator);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-xs);
    border-radius: var(--ddb-radius-md);
    font-size: var(--ddb-font-size-base);
    font-weight: 600;
    min-width: 1.25rem;
    text-align: center;
}

/* All filter */
.filter-btn.filter-all {
    color: var(--ddb-text-secondary);
}
.filter-btn.filter-all.active {
    background-color: var(--ddb-text-secondary);
    color: var(--ddb-text-on-color);
    border-color: var(--ddb-text-secondary);
}
.filter-btn.filter-all.active .filter-count {
    background-color: rgba(var(--ddb-glass-rgb), 0.3);
    color: var(--ddb-text-on-color);
}

/* Uploading filter */
.filter-btn.filter-uploading {
    color: var(--ddb-primary);
    border-color: rgba(var(--ddb-primary-rgb), 0.3);
}
.filter-btn.filter-uploading .filter-count {
    background-color: rgba(var(--ddb-primary-rgb), 0.1);
    color: var(--ddb-primary);
}
.filter-btn.filter-uploading.active {
    background-color: var(--ddb-primary);
    color: var(--ddb-text-on-color);
    border-color: var(--ddb-primary);
}
.filter-btn.filter-uploading.active .filter-count {
    background-color: rgba(var(--ddb-glass-rgb), 0.3);
    color: var(--ddb-text-on-color);
}

/* Done filter */
.filter-btn.filter-done {
    color: var(--ddb-success-text);
    border-color: rgba(var(--ddb-success-rgb), 0.3);
}
.filter-btn.filter-done .filter-count {
    background-color: rgba(var(--ddb-success-rgb), 0.1);
    color: var(--ddb-success-text);
}
.filter-btn.filter-done.active {
    background-color: var(--ddb-success);
    color: var(--ddb-text-on-color);
    border-color: var(--ddb-success);
}
.filter-btn.filter-done.active .filter-count {
    background-color: rgba(var(--ddb-glass-rgb), 0.3);
    color: var(--ddb-text-on-color);
}

/* Error filter */
.filter-btn.filter-error {
    color: var(--ddb-danger);
    border-color: rgba(var(--ddb-danger-rgb), 0.3);
}
.filter-btn.filter-error .filter-count {
    background-color: rgba(var(--ddb-danger-rgb), 0.1);
    color: var(--ddb-danger);
}
.filter-btn.filter-error.has-errors {
    border-color: var(--ddb-danger);
}
.filter-btn.filter-error.active {
    background-color: var(--ddb-danger);
    color: var(--ddb-text-on-color);
    border-color: var(--ddb-danger);
}
.filter-btn.filter-error.active .filter-count {
    background-color: rgba(var(--ddb-glass-rgb), 0.3);
    color: var(--ddb-text-on-color);
}

/* Body */
.upload-body {
    flex: 0 0 22rem; /* Fixed height - doesn't change when filtering */
    overflow-y: auto;
}


.file-list-scroller {
    height: 100%;
    overflow-y: auto;
}

/* Footer */
.upload-footer {
    flex-shrink: 0;
    padding: var(--ddb-spacing-md) var(--ddb-spacing-lg);
    border-top: var(--ddb-border-width) solid var(--ddb-border);
}

.total-progress-container {
    margin-bottom: 0.75rem;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text-secondary);
    margin-bottom: 0.25rem;
}

.progress-speed-info {
    display: flex;
    justify-content: space-between;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text-secondary);
    margin-bottom: 0.25rem;
}

.progress-speed-info i {
    margin-right: 0.25rem;
}

.total-progress-bar {
    height: 0.5rem;
    background-color: var(--ddb-border-separator);
    border-radius: 0.25rem;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background-color: var(--ddb-success);
    transition: width 0.3s ease;
}

</style>
