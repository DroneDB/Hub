<template>
    <div class="file-upload-row" :class="statusClass">
        <div class="file-icon">
            <i v-if="file.status === 'pending'" class="fa-regular fa-clock grey"></i>
            <i v-else-if="file.status === 'uploading'" class="fa-solid fa-circle-notch fa-spin blue"></i>
            <i v-else-if="file.status === 'done'" class="fa-solid fa-circle-check green"></i>
            <i v-else-if="file.status === 'error'" class="fa-solid fa-circle-xmark red"></i>
        </div>
        <div class="file-info">
            <div class="file-name" :title="file.name">{{ file.name }}</div>
            <div class="file-size">{{ humanSize }}</div>
        </div>
        <div class="file-progress">
            <div v-if="file.status === 'uploading'" class="progress-bar-container">
                <div class="progress-bar" :style="{ width: file.progress + '%' }"></div>
                <span class="progress-text">{{ file.progress.toFixed(0) }}%</span>
            </div>
            <div v-else-if="file.status === 'error'" class="error-message" :title="file.errorMessage">
                {{ truncatedError }}
                <Button v-if="file.canRetry" size="small" severity="danger" outlined @click="$emit('retry', file)" title="Retry upload"
                    icon="fa-solid fa-rotate-right" class="retry-btn" />
            </div>
            <div v-else-if="file.status === 'done'" class="done-label">
                <i class="fa-solid fa-check"></i> Done
            </div>
        </div>
    </div>
</template>

<script>
import { bytesToSize } from '../libs/utils';
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
        }
    },
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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ddb-border-separator);
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
    font-size: 0.8125rem;
    color: var(--ddb-text);
}

.file-size {
    font-size: 0.6875rem;
    color: var(--ddb-text-muted);
    margin-top: 0.125rem;
}

.file-progress {
    width: 11.25rem;
    flex-shrink: 0;
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
    font-size: 0.6875rem;
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

</style>
