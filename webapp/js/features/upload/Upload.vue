<template>
    <div id="upload">
        <div v-if="error" class="error-msg">
            <Message v-model="error" />
        </div>
        <div v-if="uploading || url" class="container">
            <div v-if="uploading" class="uploading">
                <LoadingSpinner v-if="totalBytes === 0" />

                <Card v-if="totalBytes > 0">
                    <template #content>
                        <LoadingSpinner v-if="Object.keys(fileUploadStatus).length === 0" />
                        <template v-if="!inIframe">
                            <div v-for="f in Object.keys(fileUploadStatus)" :key="f" class="progress-indicator">
                                <ProgressBar :value="parseFloat(fileUploadStatus[f].toFixed(2))" :show-value="false" style="height: 0.75rem; margin-bottom: 0.25rem;" />
                                <div class="label">{{ (fileUploadStatus[f]).toFixed(2) }}% - {{ f }}</div>
                            </div>
                        </template>
                        <div v-if="totalBytes - totalBytesSent > 0" class="remaining">
                            <span>Remaining: {{ filesCount - uploadedFiles }} files ({{ humanRemainingBytes }})</span>
                        </div>
                        <ProgressBar :value="parseFloat(totalProgress)" style="height: 0.5rem; margin-top: 0.5rem;" :show-value="false" />
                    </template>
                </Card>

                <Button severity="danger" size="large" icon="fa-solid fa-circle-stop" label="Cancel" @click="handleCancel" />
            </div>
        </div>

        <!-- Drop files here, or use the button -->
        <div ref="droparea" class="droparea" :class="{ hidden: url || uploading }" role="presentation"
             @dragover.prevent @drop.prevent="handleDrop">
            <Button ref="btnUpload" severity="info" size="large" icon="fa-solid fa-cloud-arrow-up" label="Upload Files" @click="handleUpload" />
        </div>

    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/Message.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import ProgressBar from 'primevue/progressbar';
import { bytesToSize } from '@/libs/utils';
import { inIframe } from '@/libs/utils';
import reg from '@/libs/api/sharedRegistry';
import { useUploadQueue } from '@/composables/useUploadQueue';
import { createUploadRequests } from '@/libs/upload/uploadRequests';
import { authorizedGetJson } from '@/libs/upload/uploadFormat';
import { planNextJob } from '@/libs/upload/uploadPlanner';
import { markRaw } from 'vue';

// The share endpoint takes one file per request and keeps no receipts
const ONE_FILE_PER_REQUEST = { bundleMaxFiles: 1, chunkedFileBytes: Number.POSITIVE_INFINITY };

/**
 * Upload - the share page: files dropped or picked here go to a new share batch, which is
 * committed (and opened) once every file is uploaded. Same upload queue as the dataset
 * upload dialog (useUploadQueue).
 */
export default {
    name: 'UploadPage',
    components: { LoadingSpinner,
        Message, Button, Card, ProgressBar
    },
    data: function () {
        return {
            error: "",
            inIframe: inIframe(),
            url: "",
            uploadToken: null,
            // Reactive property holding a raw queue: a new queue (after Cancel) re-renders
            queue: markRaw(this.createQueue())
        }
    },
    computed: {
        snapshot() {
            return this.queue.state.value;
        },
        uploading() {
            return this.snapshot != null && !this.snapshot.done;
        },
        filesCount() {
            return this.snapshot?.counts.total ?? 0;
        },
        uploadedFiles() {
            return this.snapshot?.counts.done ?? 0;
        },
        totalBytes() {
            return this.snapshot?.totalBytes ?? 0;
        },
        totalBytesSent() {
            return this.snapshot?.bytesSent ?? 0;
        },
        // Progress of the files being sent right now, by name
        fileUploadStatus() {
            const status = {};
            for (const row of this.queue.rows(r => r.status === 'uploading' || r.status === 'processing'))
                status[row.name] = row.progress;
            return status;
        },
        humanRemainingBytes: function () {
            return bytesToSize(this.totalBytes - this.totalBytesSent);
        },
        totalProgress: function () {
            if (this.totalBytes === 0) return 0;
            return (this.totalBytesSent / this.totalBytes * 100.0).toFixed(2);
        },
        fullUrl: function () {
            return reg.url + this.url;
        }
    },
    beforeUnmount: function () {
        // No ghost uploads: requests in flight and pending retries stop with the view
        this._isUnmounted = true;
        this.queue.cancel();
    },
    methods: {
        createQueue() {
            return useUploadQueue({
                // The batch exists before the first file is queued (addFiles)
                send: (job, hooks) => this.shareRequests.send(job, hooks),
                plan: ready => planNextJob(ready, ONE_FILE_PER_REQUEST),
                onIdle: snapshot => this.onIdle(snapshot)
            });
        },

        async addFiles(fileList) {
            const files = Array.from(fileList || []);
            if (files.length === 0) return;

            try {
                if (!this.uploadToken) {
                    const r = await reg.share.init();
                    this.uploadToken = r.token;
                    this.shareRequests = createUploadRequests({
                        baseUrl: reg.url,
                        singleUrl: reg.share.uploadUrl(this.uploadToken),
                        authToken: () => reg.getAuthToken(),
                        getJson: authorizedGetJson(reg),
                        destination: item => item.path,
                        receipts: false
                    });
                }
                this.queue.add(files.map(file => ({ file, path: file.name })));
            } catch (e) {
                this.error = `Cannot initialize upload: ${e.message}`;
            }
        },

        // Commit only when every file went through
        async onIdle(snapshot) {
            if (this._isUnmounted || this.committing) return;
            const failed = snapshot.items.filter(i => i.status === 'error');
            if (failed.length > 0) {
                this.error = failed.length === 1
                    ? `Failed to upload ${failed[0].name}: ${failed[0].errorMessage}`
                    : `Failed to upload ${failed.length} files (first: ${failed[0].name}: ${failed[0].errorMessage})`;
                return;
            }

            this.committing = true;
            try {
                const r = await reg.share.commit(this.uploadToken);
                // The component may unmount while the commit is in flight
                if (r.url && !this._isUnmounted) {
                    location.href = r.url;
                } else if (r.error) {
                    this.error = r.error;
                } else {
                    this.error = `Cannot upload files: ${JSON.stringify(r)}`;
                }
            } catch (e) {
                this.error = e.message;
            } finally {
                this.committing = false;
            }
        },

        handleDrop(ev) {
            this.addFiles(ev.dataTransfer?.files);
        },

        handleCancel: function () {
            this.queue.cancel();
            this.queue = markRaw(this.createQueue());
            this.uploadToken = null;
            this.shareRequests = null;
            this.error = "";
        },

        handleUpload: function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.style.display = 'none';
            // lifetime: element (a one-shot file input created here)
            input.addEventListener('change', (e) => {
                this.addFiles(e.target.files);
                document.body.removeChild(input);
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        }
    }
}
</script>

<style scoped>
.button,
.container,
.error-msg {
    margin: 1rem;
}

.droparea {
    width: 100%;
    height: 100%;
}

#upload {
    text-align: center;
    height: 100%;
}

.uploading {
    width: 100%;
    text-align: center;

    .circle.notch {
        margin-bottom: var(--ddb-spacing-md);
        height: 1.25rem;
        width: 1.25rem;
    }

    .progress-indicator {
        margin-bottom: 2.25rem;
    }
}

.hidden {
    visibility: hidden;
}
</style>
