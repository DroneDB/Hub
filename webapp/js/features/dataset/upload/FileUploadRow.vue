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
                <span class="progress-text">{{ file.progress.toFixed(0) }}%</span>
            </div>
            <div v-else-if="file.status === 'processing'" class="progress-bar-container processing"
                 title="Every byte is sent: the server is adding the file to the dataset">
                <div class="progress-bar indeterminate" />
                <span class="progress-text">Processing on server...</span>
            </div>
            <div v-else-if="file.status === 'pending' && file.errorMessage" class="pending-message" :title="file.errorMessage">
                {{ file.errorMessage }}
            </div>
            <div v-else-if="file.status === 'error'" class="error-message" :title="file.errorMessage">
                {{ truncatedError }}
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
    computed: {
        humanSize() {
            return bytesToSize(this.file.size);
        },
        statusClass() {
            return `status-${this.file.status}`;
        },
        truncatedError() {
            if (!this.file.errorMessage) return 'Upload failed';
            const msg = this.file.errorMessage;
            return msg.length > 40 ? msg.substring(0, 40) + '...' : msg;
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

.file-progress {
    width: 11.25rem;
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
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: var(--ddb-font-size-sm);
    font-weight: bold;
    color: var(--ddb-text);
}

.error-message {
    display: flex;
    align-items: center;
    color: var(--ddb-danger);
    font-size: 0.75rem;
}

.retry-btn {
    margin-left: 0.5rem;
}

.done-label {
    color: var(--ddb-success);
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
