<template>
    <div id="upload-dialog">
        <!-- Hidden file input for file picker -->
        <input type="file" ref="fileInput" multiple webkitdirectory style="display: none" @change="handleFileInputChange" />
        <input type="file" ref="fileInputFiles" multiple style="display: none" @change="handleFileInputChange" />

        <!-- Waiting for file selection -->
        <template v-if="waitingForFiles">
            <div class="file-selection-screen">
                <div class="selection-content">
                    <i class="icon cloud upload huge"></i>
                    <h3>Select files to upload</h3>
                    <p>Choose files or folders to upload to this dataset</p>
                    <div class="selection-buttons">
                        <button class="ui button primary" @click="openFilePicker">
                            <i class="file icon"></i> Select Files
                        </button>
                        <button class="ui button" @click="openFolderPicker">
                            <i class="folder icon"></i> Select Folder
                        </button>
                    </div>
                    <div class="selection-cancel">
                        <button class="ui button basic" @click="cancelSelection">Cancel</button>
                    </div>
                </div>
            </div>
        </template>

        <!-- Upload progress view -->
        <template v-else>
            <!-- Header con filtri -->
        <div class="upload-header">
            <div class="upload-filters">
                <button class="filter-btn filter-all" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
                    <i class="icon file"></i>
                    <span class="filter-label">All</span>
                    <span class="filter-count">{{ counts.total }}</span>
                </button>
                <button v-if="!done || counts.error > 0" class="filter-btn filter-uploading" :class="{ active: activeFilter === 'uploading' }" @click="activeFilter = 'uploading'">
                    <i class="icon circle notch" :class="{ spin: counts.uploading > 0 }"></i>
                    <span class="filter-label">In Progress</span>
                    <span class="filter-count">{{ counts.uploading + counts.pending }}</span>
                </button>
                <button class="filter-btn filter-done" :class="{ active: activeFilter === 'done' }" @click="activeFilter = 'done'">
                    <i class="icon check"></i>
                    <span class="filter-label">Done</span>
                    <span class="filter-count">{{ counts.done }}</span>
                </button>
                <button v-if="counts.error > 0" class="filter-btn filter-error" :class="{ active: activeFilter === 'error', 'has-errors': counts.error > 0 }" @click="activeFilter = 'error'">
                    <i class="icon times"></i>
                    <span class="filter-label">Errors</span>
                    <span class="filter-count">{{ counts.error }}</span>
                </button>
            </div>
        </div>

        <!-- Body con lista file scrollabile -->
        <div class="upload-body">
            <RecycleScroller
                class="file-list-scroller"
                :items="filteredFiles"
                :item-size="48"
                key-field="id"
                v-slot="{ item }"
            >
                <FileUploadRow :file="item" @retry="retryFile" />
            </RecycleScroller>
        </div>

        <!-- Footer con progress totale e pulsanti -->
        <div class="upload-footer">
            <div class="total-progress-container" v-if="uploading">
                <div class="progress-info">
                    <span>{{ humanBytesSent }} / {{ humanTotalBytes }}</span>
                    <span>{{ totalProgress.toFixed(1) }}%</span>
                </div>
                <div class="total-progress-bar">
                    <div class="progress-fill" :style="{ width: totalProgress + '%' }"></div>
                </div>
            </div>

            <!-- Upload summary stats (shown when done) -->
            <div class="upload-summary" v-if="done">
                <div class="summary-stats">
                    <div class="summary-stat">
                        <i class="icon clock outline"></i>
                        <span class="stat-label">Duration:</span>
                        <span class="stat-value">{{ uploadDuration }}</span>
                    </div>
                    <div class="summary-stat">
                        <i class="icon database"></i>
                        <span class="stat-label">Data transferred:</span>
                        <span class="stat-value">{{ humanTotalBytes }}</span>
                    </div>
                    <div class="summary-stat">
                        <i class="icon tachometer alternate"></i>
                        <span class="stat-label">Average speed:</span>
                        <span class="stat-value">{{ averageSpeed }}</span>
                    </div>
                </div>
                <div class="upload-result" :class="{ success: counts.error === 0, 'has-errors': counts.error > 0 }">
                    <template v-if="counts.error === 0">
                        <i class="icon check circle"></i> All {{ counts.done }} files uploaded successfully!
                    </template>
                    <template v-else>
                        <i class="icon warning sign"></i> {{ counts.done }} succeeded, {{ counts.error }} failed
                    </template>
                </div>
            </div>

            <div class="upload-actions">
                <button v-if="uploading" class="ui button negative" @click="handleCancel">
                    <i class="stop circle outline icon"></i> Cancel Upload
                </button>

                <template v-if="done">
                    <button v-if="counts.error > 0" class="ui button orange" @click="retryAllFailed">
                        <i class="redo icon"></i> Retry Failed ({{ counts.error }})
                    </button>
                    <button class="ui button primary" @click="finishUpload">
                        <i class="check icon"></i> Close
                    </button>
                </template>
            </div>
        </div>
        </template><!-- end upload progress view -->
    </div>
</template>

<script>
import Message from './Message.vue';
import FileUploadRow from './FileUploadRow.vue';
import ddb from 'ddb';
import { bytesToSize } from '../libs/utils';
import Dropzone from '../vendor/dropzone';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

// Constants for retry logic
const MAX_RETRIES = 3;
const SMALL_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default {
    components: {
        Message,
        FileUploadRow
    },
    props: ['organization', 'dataset', 'path', 'filesToUpload'],
    data: function () {
        return {
            error: null,
            uploading: false,
            done: false,
            activeFilter: 'uploading',
            waitingForFiles: false,  // True when waiting for user to select files

            // File tracking
            fileList: {},  // { [id]: { id, name, size, status, progress, errorMessage, retryCount, canRetry, dzFile } }

            // Progress tracking
            totalBytes: 0,
            totalBytesSent: 0,
            lastUpdated: 0,

            // Time tracking
            uploadStartTime: null,
            uploadEndTime: null
        }
    },
    computed: {
        counts() {
            const files = Object.values(this.fileList);
            return {
                total: files.length,
                pending: files.filter(f => f.status === 'pending').length,
                uploading: files.filter(f => f.status === 'uploading').length,
                done: files.filter(f => f.status === 'done').length,
                error: files.filter(f => f.status === 'error').length
            };
        },

        filteredFiles() {
            const files = Object.values(this.fileList);
            if (this.activeFilter === 'all') return files;
            if (this.activeFilter === 'uploading') return files.filter(f => f.status === 'uploading' || f.status === 'pending');
            return files.filter(f => f.status === this.activeFilter);
        },

        humanTotalBytes() {
            return bytesToSize(this.totalBytes);
        },

        humanBytesSent() {
            return bytesToSize(this.totalBytesSent);
        },

        totalProgress() {
            if (this.totalBytes === 0) return 0;
            return (this.totalBytesSent / this.totalBytes * 100.0);
        },

        uploadDuration() {
            if (!this.uploadStartTime) return '0s';
            const endTime = this.uploadEndTime || new Date();
            const durationMs = endTime - this.uploadStartTime;
            const seconds = Math.floor(durationMs / 1000);
            if (seconds < 60) return `${seconds}s`;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
        },

        averageSpeed() {
            if (!this.uploadStartTime || !this.uploadEndTime) return '0 B/s';
            const durationMs = this.uploadEndTime - this.uploadStartTime;
            if (durationMs <= 0) return '0 B/s';
            const bytesPerSecond = (this.totalBytesSent / durationMs) * 1000;
            return bytesToSize(bytesPerSecond) + '/s';
        }
    },
    mounted: async function () {
        Dropzone.autoDiscover = false;

        // Dialog starts not closable during upload
        this.$emit('update:closable', false);

        // Create a hidden dropzone element for file handling
        this.hiddenDropzone = document.createElement('div');
        this.hiddenDropzone.style.display = 'none';
        document.body.appendChild(this.hiddenDropzone);

        this.dz = new Dropzone(this.hiddenDropzone, {
            paramName: function () { return "file"; },
            url: "/share/upload/<uuid>",
            parallelUploads: 8,
            uploadMultiple: false,
            autoProcessQueue: false,
            createImageThumbnails: false,
            maxFilesize: Number.MAX_SAFE_INTEGER,
            previewTemplate: '<div style="display:none"></div>',
            chunkSize: Number.MAX_SAFE_INTEGER,
            timeout: 2147483647
        });

        this.dz.on("processing", (file) => {
            this.dz.options.url = `/orgs/${this.organization}/ds/${this.dataset}/obj`;
            this.updateFileStatus(file.upload.uuid, 'uploading', 0);
        })
        .on("error", (file, message) => {
            const fileId = file.upload.uuid;
            const fileInfo = this.fileList[fileId];
            const errorMsg = this.parseErrorMessage(message);

            // Check if auto-retry is allowed (small files, under max retries)
            const canAutoRetry = file.size < SMALL_FILE_SIZE && fileInfo.retryCount < MAX_RETRIES;

            if (canAutoRetry) {
                // Increment retry count and schedule retry with exponential backoff
                fileInfo.retryCount++;
                const delay = Math.pow(2, fileInfo.retryCount) * 1000; // 2s, 4s, 8s

                console.log(`Auto-retry ${fileInfo.name} (attempt ${fileInfo.retryCount}/${MAX_RETRIES}) in ${delay/1000}s`);
                this.updateFileStatus(fileId, 'pending', 0, `Retrying... (${fileInfo.retryCount}/${MAX_RETRIES})`);

                file.status = Dropzone.QUEUED;
                setTimeout(() => this.dz.processQueue(), delay);
            } else {
                // Mark as error, allow manual retry for large files
                const canManualRetry = file.size >= SMALL_FILE_SIZE || fileInfo.retryCount >= MAX_RETRIES;
                this.updateFileStatus(fileId, 'error', 0, errorMsg);
                this.$set(this.fileList[fileId], 'canRetry', canManualRetry);
                this.$set(this.fileList[fileId], 'dzFile', file);

                // Keep file in dropzone for potential retry
                file.status = Dropzone.ERROR;

                // Continue processing queue
                setTimeout(() => this.dz.processQueue(), 500);
            }
        })
        .on("uploadprogress", (file, progress, bytesSent) => {
            const now = new Date().getTime();

            if (bytesSent > file.size) bytesSent = file.size;

            if (progress === 100 || now - this.lastUpdated > 300) {
                const deltaBytesSent = bytesSent - (file.deltaBytesSent || 0);
                file.trackedBytesSent = (file.trackedBytesSent || 0) + deltaBytesSent;

                this.totalBytesSent = this.totalBytesSent + deltaBytesSent;
                this.lastUpdated = now;
                this.updateFileStatus(file.upload.uuid, 'uploading', progress);
                file.deltaBytesSent = bytesSent;
            }
        })
        .on("addedfile", (file) => {
            // Handle each file as it's added
            file.deltaBytesSent = 0;
            file.trackedBytesSent = 0;

            // Add to fileList
            const id = file.upload.uuid;
            this.$set(this.fileList, id, {
                id: id,
                name: file.fullPath || file.name,
                size: file.size,
                status: 'pending',
                progress: 0,
                errorMessage: '',
                retryCount: 0,
                canRetry: false,
                dzFile: file
            });

            this.totalBytes += file.size;
            this.uploading = true;
            this.$emit('update:closable', false);

            // Start time tracking on first file
            if (!this.uploadStartTime) {
                this.uploadStartTime = new Date();
            }
        })
        .on("complete", (file) => {
            if (file.status === "success") {
                this.updateFileStatus(file.upload.uuid, 'done', 100);

                // Correct total bytes sent
                this.totalBytesSent = this.totalBytesSent + file.size;
                if (file.trackedBytesSent) this.totalBytesSent -= file.trackedBytesSent;

                this.$emit('onUpload', JSON.parse(file.xhr.response));
            }

            setTimeout(() => this.dz.processQueue(), 100);
        })
        .on("sending", (file, xhr, formData) => {
            // Use fullPath to preserve folder structure, fallback to name
            const filePath = file.fullPath || file.name;
            formData.append("path", !this.path ? filePath : (this.path + "/" + filePath));
        })
        .on("queuecomplete", async () => {
            // Check if all files are done or error (no pending/uploading)
            const pending = this.counts.pending + this.counts.uploading;
            if (pending === 0) {
                this.uploading = false;
                this.done = true;
                this.uploadEndTime = new Date();
                this.$emit('update:closable', true);
                // Switch to appropriate tab based on results
                this.activeFilter = this.counts.error > 0 ? 'error' : 'done';
            }
        })
        .on("reset", () => {
            this.resetUpload();
        });

        // Start processing files passed via prop
        if (this.filesToUpload != null && this.filesToUpload.length > 0) {
            this.waitingForFiles = false;
            // Convert to array if needed (FileList is not a real array)
            // and assign fullPath from webkitRelativePath for folder uploads
            const fileArray = Array.from(this.filesToUpload).map(file => {
                if (file.webkitRelativePath) {
                    file.fullPath = file.webkitRelativePath;
                }
                return file;
            });
            // handleFiles assigns upload.uuid and triggers addedfile event
            this.dz.handleFiles(fileArray);
            this.dz.processQueue();
        } else {
            // No files passed, show file selection screen
            this.waitingForFiles = true;
            this.$emit('update:closable', true);
        }
    },
    beforeDestroy() {
        // Clean up hidden dropzone element
        if (this.hiddenDropzone && this.hiddenDropzone.parentNode) {
            this.hiddenDropzone.parentNode.removeChild(this.hiddenDropzone);
        }
    },
    methods: {
        updateFileStatus(id, status, progress, errorMessage = '') {
            if (this.fileList[id]) {
                this.$set(this.fileList[id], 'status', status);
                this.$set(this.fileList[id], 'progress', progress);
                if (errorMessage) {
                    this.$set(this.fileList[id], 'errorMessage', errorMessage);
                }
            }
        },

        parseErrorMessage(message) {
            if (typeof message === 'string') return message;
            if (message && message.error) return message.error;
            if (message && message.message) return message.message;
            return 'Upload failed';
        },

        resetUpload() {
            this.fileList = {};
            this.totalBytes = 0;
            this.lastUpdated = 0;
            this.totalBytesSent = 0;
            this.error = null;
            this.uploading = false;
            this.done = false;
            this.activeFilter = 'all';
            this.uploadStartTime = null;
            this.uploadEndTime = null;
            if (this.dz) this.dz.removeAllFiles(true);
        },

        retryFile(file) {
            if (!file.dzFile) return;

            // Reset file status
            file.retryCount = 0;
            file.status = 'pending';
            file.progress = 0;
            file.errorMessage = '';
            file.canRetry = false;

            // Re-queue in Dropzone
            file.dzFile.status = Dropzone.QUEUED;
            this.uploading = true;
            this.done = false;
            this.$emit('update:closable', false);
            this.dz.processQueue();
        },

        retryAllFailed() {
            const failedFiles = Object.values(this.fileList).filter(f => f.status === 'error');
            for (const file of failedFiles) {
                this.retryFile(file);
            }
        },

        handleCancel() {
            this.dz.removeAllFiles(true);
            this.resetUpload();
            this.$emit('update:closable', true);
            this.$emit('onClose');
        },

        finishUpload() {
            this.$emit('onClose');
        },

        // File picker methods
        openFilePicker() {
            this.$refs.fileInputFiles.click();
        },

        openFolderPicker() {
            this.$refs.fileInput.click();
        },

        cancelSelection() {
            this.$emit('onClose');
        },

        handleFileInputChange(event) {
            const files = event.target.files;
            if (!files || files.length === 0) {
                return;
            }

            // Convert FileList to array and assign fullPath from webkitRelativePath
            const fileArray = Array.from(files).map(file => {
                // webkitRelativePath contains the relative path including folder structure
                // e.g. "folder/subfolder/file.jpg"
                if (file.webkitRelativePath) {
                    file.fullPath = file.webkitRelativePath;
                }
                return file;
            });

            this.waitingForFiles = false;
            this.$emit('update:closable', false);

            // Add files to dropzone - handleFiles must be called first to assign upload.uuid
            this.dz.handleFiles(fileArray);
            // The addedfiles event will be triggered automatically by handleFiles
            this.dz.processQueue();

            // Clear the input for future use
            event.target.value = '';
        }
    }
}
</script>

<style scoped>
#upload-dialog {
    display: flex;
    flex-direction: column;
    min-width: 500px;
    max-width: 800px;
    min-height: 300px;
    max-height: 80vh;
}

/* Header */
.upload-header {
    flex-shrink: 0;
    padding: 12px 16px;
    border-bottom: 1px solid #ddd;
    background-color: #f9f9f9;
}

.upload-filters {
    display: flex;
    gap: 6px;
}

.filter-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
}

.filter-btn:hover {
    background-color: #f0f0f0;
}

.filter-btn .filter-count {
    background-color: #e0e0e0;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    min-width: 20px;
    text-align: center;
}

/* All filter */
.filter-btn.filter-all {
    color: #666;
}
.filter-btn.filter-all.active {
    background-color: #666;
    color: white;
    border-color: #666;
}
.filter-btn.filter-all.active .filter-count {
    background-color: rgba(255,255,255,0.3);
    color: white;
}

/* Uploading filter */
.filter-btn.filter-uploading {
    color: #2185d0;
    border-color: #b3d4f0;
}
.filter-btn.filter-uploading .filter-count {
    background-color: #d4e9f9;
    color: #2185d0;
}
.filter-btn.filter-uploading.active {
    background-color: #2185d0;
    color: white;
    border-color: #2185d0;
}
.filter-btn.filter-uploading.active .filter-count {
    background-color: rgba(255,255,255,0.3);
    color: white;
}

/* Done filter */
.filter-btn.filter-done {
    color: #21ba45;
    border-color: #b3e6c0;
}
.filter-btn.filter-done .filter-count {
    background-color: #d4f5dc;
    color: #21ba45;
}
.filter-btn.filter-done.active {
    background-color: #21ba45;
    color: white;
    border-color: #21ba45;
}
.filter-btn.filter-done.active .filter-count {
    background-color: rgba(255,255,255,0.3);
    color: white;
}

/* Error filter */
.filter-btn.filter-error {
    color: #db2828;
    border-color: #f0b3b3;
}
.filter-btn.filter-error .filter-count {
    background-color: #fad4d4;
    color: #db2828;
}
.filter-btn.filter-error.has-errors {
    border-color: #db2828;
}
.filter-btn.filter-error.active {
    background-color: #db2828;
    color: white;
    border-color: #db2828;
}
.filter-btn.filter-error.active .filter-count {
    background-color: rgba(255,255,255,0.3);
    color: white;
}

/* Body */
.upload-body {
    flex: 0 0 350px; /* Fixed height - doesn't change when filtering */
    overflow-y: auto;
    width: 600px;
}

.file-list-scroller {
    height: 100%;
    overflow-y: auto;
}

/* Footer */
.upload-footer {
    flex-shrink: 0;
    padding: 12px 16px;
    border-top: 1px solid #ddd;
    background-color: #f9f9f9;
}

.total-progress-container {
    margin-bottom: 12px;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
}

.total-progress-bar {
    height: 8px;
    background-color: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background-color: #21ba45;
    transition: width 0.3s ease;
}

.upload-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-end;
}

.upload-result {
    flex: 1;
    font-size: 14px;
    display: flex;
    gap: 8px;
}

.upload-result.success {
    color: #21ba45;
}

.upload-result.has-errors {
    color: #f2711c;
}

/* Spinning animation */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.icon.spin {
    animation: spin 1s linear infinite;
}

/* File selection screen */
.file-selection-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 60px;
    min-width: 400px;
}

.selection-content {
    text-align: center;
    padding: 40px;
}

.selection-content .icon.cloud.upload {
    color: #2185d0;
    margin-bottom: 16px;
}

.selection-content h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
    color: #333;
}

.selection-content p {
    margin: 0 0 24px 0;
    color: #666;
    font-size: 14px;
}

.selection-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 24px;
}

.selection-cancel {
    margin-top: 8px;
}

/* Upload summary */
.upload-summary {
    background-color: #f8f9fa;
    border-radius: 6px;
}

.summary-stats {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 12px;
}

.summary-stat {
    display: flex;
    gap: 6px;
    font-size: 13px;
}

.summary-stat .icon {
    color: #666;
}

.summary-stat .stat-label {
    color: #666;
}

.summary-stat .stat-value {
    font-weight: 600;
    color: #333;
}

.upload-summary .upload-result {
    text-align: center;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    margin-top: 4px;
}
</style>

