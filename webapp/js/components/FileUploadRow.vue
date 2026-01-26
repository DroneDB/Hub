<template>
    <div class="file-upload-row" :class="statusClass">
        <div class="file-icon">
            <i v-if="file.status === 'pending'" class="icon clock outline grey"></i>
            <i v-else-if="file.status === 'uploading'" class="icon circle notch spin blue"></i>
            <i v-else-if="file.status === 'done'" class="icon check circle green"></i>
            <i v-else-if="file.status === 'error'" class="icon times circle red"></i>
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
                <button v-if="file.canRetry" class="retry-btn" @click="$emit('retry', file)" title="Retry upload">
                    <i class="icon redo"></i>
                </button>
            </div>
            <div v-else-if="file.status === 'done'" class="done-label">
                <i class="icon check"></i> Done
            </div>
        </div>
    </div>
</template>

<script>
import { bytesToSize } from '../libs/utils';

export default {
    name: 'FileUploadRow',
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
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
    height: 48px;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
}

.file-upload-row:hover {
    background-color: #f9f9f9;
}

.file-upload-row.status-error {
    background-color: #fff5f5;
}

.file-upload-row.status-done {
    background-color: #f5fff5;
}

.file-upload-row.status-uploading {
    background-color: #f5f9ff;
}

.file-icon {
    width: 24px;
    flex-shrink: 0;
    text-align: center;
}

.file-icon i {
    font-size: 16px;
}

.file-info {
    flex: 1;
    min-width: 0;
    padding: 0 12px;
}

.file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    color: #333;
}

.file-size {
    font-size: 11px;
    color: #888;
    margin-top: 2px;
}

.file-progress {
    width: 180px;
    flex-shrink: 0;
}

.progress-bar-container {
    position: relative;
    height: 20px;
    background-color: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background-color: #21ba45;
    transition: width 0.3s ease;
}

.progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 11px;
    font-weight: bold;
    color: #333;
}

.error-message {
    display: flex;
    align-items: center;
    color: #db2828;
    font-size: 12px;
}

.retry-btn {
    background: none;
    border: 1px solid #db2828;
    border-radius: 4px;
    color: #db2828;
    cursor: pointer;
    padding: 2px 6px;
    margin-left: 8px;
    font-size: 11px;
}

.retry-btn:hover {
    background-color: #db2828;
    color: white;
}

.done-label {
    color: #21ba45;
    font-size: 12px;
    font-weight: 500;
}

/* Spinning animation for upload icon */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.icon.spin {
    animation: spin 1s linear infinite;
}
</style>
