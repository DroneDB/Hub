<template>
    <div class="file-upload-row" :class="statusClass">
        <div class="file-icon">
            <i v-if="file.status === 'pending'" class="fa-regular fa-clock grey" />
            <i v-else-if="file.status === 'uploading'" class="fa-solid fa-circle-notch fa-spin blue" />
            <i v-else-if="file.status === 'processing'" class="fa-solid fa-gears blue" title="Processing on server" />
            <i v-else-if="file.status === 'done'" class="fa-solid fa-circle-check green" />
            <i v-else-if="file.status === 'error'" class="fa-solid fa-circle-xmark red" />
        </div>
        <div class="file-info">
            <div class="file-name" :title="file.name">{{ file.name }}</div>
            <div class="file-size">{{ humanSize }}</div>
        </div>
        <div class="file-progress">
            <div v-if="file.status === 'uploading'" class="progress-bar-container">
                <div class="progress-bar" :style="{ width: file.progress + '%' }" />
                <span class="progress-text">{{ percentText }}</span>
            </div>
            <div v-else-if="file.status === 'processing'" class="progress-bar-container processing"
                 title="Every byte is sent: the server is adding the file to the dataset">
                <div class="progress-bar indeterminate" />
                <span class="progress-text">Processing on server...</span>
            </div>
            <div v-else-if="file.status === 'pending' && file.errorMessage" class="pending-message" :title="file.errorMessage">
                {{ file.errorMessage }}
            </div>
            <div v-else-if="file.status === 'error'" class="error-message">
                <!-- The whole reason: two lines, all of it on click (or Enter), and read in full by a screen reader -->
                <button type="button" class="error-text" :class="{ expanded }" :aria-expanded="expanded"
                        :aria-describedby="reasonId" @click="expanded = !expanded">
                    {{ reason }}
                </button>
                <span :id="reasonId" class="visually-hidden">{{ reason }}</span>
                <Button v-if="file.canRetry" size="small" severity="danger" outlined title="Retry upload" aria-label="Retry upload" icon="fa-solid fa-rotate-right"
                        class="retry-btn" @click="$emit('retry', file)" />
            </div>
            <div v-else-if="file.status === 'done'" class="done-label">
                <i class="fa-solid fa-check" /> Done
            </div>
        </div>
    </div>
</template>

<script>
import { bytesToSize } from '@/libs/utils';
import { formatNumber, PRECISION } from '@/libs/format';
import Button from 'primevue/button';

export default {
    name: 'FileUploadRow',
    components: {
        Button
    },
    props: {
        file: {
            type: Object,
            required: true
            // Expected shape: { id, name, size, status, progress, errorMessage, retryCount, canRetry }
            // status: pending | uploading | processing (all bytes sent, server adding it) | done | error
        }
    },
    emits: ['retry'],
    data() {
        return { expanded: false };
    },
    computed: {
        humanSize() {
            return bytesToSize(this.file.size);
        },
        // A whole number, by the one number formatter (FR-UPL-16, FR-XC-08)
        percentText() {
            return `${formatNumber(this.file.progress, PRECISION.count)}%`;
        },
        statusClass() {
            return `status-${this.file.status}`;
        },
        reason() {
            return this.file.errorMessage || 'Upload failed';
        },
        reasonId() {
            return `upload-reason-${this.file.id}`;
        }
    }
}
</script>

<style scoped>
.file-upload-row {
    display: flex;
    align-items: center;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border-separator);
    height: 3rem;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
}

.file-upload-row:hover {
    background-color: var(--ddb-bg-light);
}

.file-upload-row.status-error {
    background-color: var(--ddb-danger-bg);
}

.file-upload-row.status-done {
    background-color: var(--ddb-success-bg);
}

.file-upload-row.status-uploading {
    background-color: var(--ddb-info-bg);
}

.file-icon {
    width: 1.5rem;
    flex-shrink: 0;
    text-align: center;
}

.file-icon i {
    font-size: 1rem;
}

/* The status icons: the class names are the colours the template asks for */
.file-icon .grey { color: var(--ddb-text-muted); }
.file-icon .blue { color: var(--ddb-primary); }
.file-icon .green { color: var(--ddb-success-text); }
.file-icon .red { color: var(--ddb-danger); }

.file-info {
    flex: 1;
    min-width: 0;
    padding: 0 0.75rem;
}

.file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text);
}

.file-size {
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-muted);
    margin-top: var(--ddb-spacing-xs);
}

/* A share of the row on narrow windows, so the name keeps room next to it */
.file-progress {
    width: min(11.25rem, 35%);
    flex-shrink: 0;
    text-align: center;
}

.progress-bar-container {
    position: relative;
    height: 1.25rem;
    background-color: var(--ddb-border-separator);
    border-radius: 0.25rem;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background-color: var(--ddb-success);
    transition: width 0.3s ease;
}

.progress-text {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    padding: 0 var(--ddb-spacing-xs);
    transform: translateY(-50%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ddb-font-size-sm);
    font-weight: bold;
    color: var(--ddb-text);
}

/* An error needs room for its reason */
.status-error .file-progress {
    width: min(20rem, 55%);
}

.error-message {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    color: var(--ddb-danger);
    font-size: 0.75rem;
}

/* Two lines in the row; expanded, the whole text over the rows below (the rows keep their height) */
.error-text {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: 1.2;
    text-align: left;
    cursor: pointer;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
}

.error-text.expanded {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: block;
    padding: var(--ddb-spacing-xs);
    background: var(--ddb-bg-surface);
    border: var(--ddb-border-width) solid var(--ddb-danger);
    border-radius: var(--ddb-radius-sm);
    box-shadow: var(--ddb-shadow-md);
}

.error-text:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 1px;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.retry-btn {
    margin-left: 0.5rem;
    flex-shrink: 0;
}

.done-label {
    color: var(--ddb-success-text);
    font-size: 0.75rem;
    font-weight: 500;
}

.progress-bar.indeterminate {
    width: 35%;
    animation: upload-processing 1.4s ease-in-out infinite;
}

@keyframes upload-processing {
    0% { margin-left: -35%; }
    100% { margin-left: 100%; }
}

.pending-message {
    font-size: 0.75rem;
    color: var(--ddb-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
