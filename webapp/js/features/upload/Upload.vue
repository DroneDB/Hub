<template>
    <div id="upload">
        <div v-if="error" class="error-msg">
            <Message bindTo="error" />
        </div>
        <div class="container" v-if="uploading || url">
            <div v-if="uploading" class="uploading">
                <div v-if="totalBytes === 0">
                    <i class="fa-solid fa-circle-notch fa-spin" />
                </div>

                <Card v-if="totalBytes > 0">
                    <template #content>
                    <div v-if="Object.keys(fileUploadStatus).length === 0">
                        <i class="fa-solid fa-circle-notch fa-spin" />
                    </div>
                    <template v-if="!inIframe">
                    <div v-for="f in Object.keys(fileUploadStatus)" :key="f" class="progress-indicator">
                        <ProgressBar :value="parseFloat(fileUploadStatus[f].toFixed(2))" :showValue="false" style="height: 0.75rem; margin-bottom: 0.25rem;" />
                        <div class="label">{{ (fileUploadStatus[f]).toFixed(2) }}% - {{ f }}</div>
                    </div>
                    </template>
                    <div v-if="totalBytes - totalBytesSent > 0" class="remaining">
                        <span>Remaining: {{ filesCount - uploadedFiles }} files ({{ humanRemainingBytes }})</span>
                    </div>
                    <ProgressBar :value="parseFloat(totalProgress)" style="height: 0.5rem; margin-top: 0.5rem;" :showValue="false" />
                    </template>
                </Card>

                <Button severity="danger" size="large" @click="handleCancel" icon="fa-solid fa-circle-stop" label="Cancel" />
            </div>
        </div>

        <div class="droparea" :class="{ hidden: url || uploading }" ref="droparea">
            <Button ref="btnUpload" @click="handleUpload" severity="info" size="large" icon="fa-solid fa-cloud-arrow-up" label="Upload Files" />
        </div>

    </div>
</template>

<script>
import Message from '@/components/Message.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import ProgressBar from 'primevue/progressbar';
import ddb from 'ddb';
import { bytesToSize } from '@/libs/utils';
import Dropzone from '@/vendor/dropzone';
import { inIframe } from '@/libs/utils';
import { useResilientUpload } from '@/composables/useResilientUpload';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message, Button, Card, ProgressBar
    },
    data: function () {
        return {
            error: "",

            uploading: false,
            fileUploadStatus: {},
            filesCount: 0,
            uploadedFiles: 0,
            inIframe: inIframe(),

            totalBytes: 0,
            totalBytesSent: 0,
            lastUpdated: 0,

            url: "",

            // Retry/backpressure policy shared with DatasetUpload.vue (see useResilientUpload)
            resilience: useResilientUpload({ parallelUploads: 8 })
        }
    },
    computed: {
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
    beforeMount: function () {
        if (!reg.ensureLoggedIn()) {
            this.$router.push({ name: "Login" }).catch(() => { });
        }
    },
    mounted: async function () {
        Dropzone.autoDiscover = false;
        this.uploadToken = null;
        // processQueue timers (completions and retries, the latter able to run up to the
        // 5-minute Retry-After cap) are tracked so unmount can cancel them - otherwise
        // pending retries keep uploading after the view is gone (ghost uploads)
        this._queueTimers = [];
        this._isUnmounted = false;

        this.dz = new Dropzone(this.$refs.droparea, {
            paramName: function () { return "file"; },
            url: "/share/upload/<uuid>", // change this later
            parallelUploads: this.resilience.aimd.current, // http://blog.olamisan.com/max-parallel-http-connections-in-a-browser max parallel connections
            uploadMultiple: false,
            autoProcessQueue: false,
            createImageThumbnails: false,
            maxFilesize: Number.MAX_SAFE_INTEGER,
            previewTemplate: '<div style="display:none"></div>',
            clickable: this.$refs.btnUpload.$el,
            // Explicit handler fully replaces dropzone's default "canceled" (options are
            // merged in the constructor via Dropzone.extend), which re-emits "Upload
            // canceled." as an "error" event with no xhr. That would classify a user
            // cancellation as a transient status-0 failure: AIMD budget halved and the
            // file re-queued for retry. Note: dropzone internally still wires
            // canceled -> complete (init), so the "complete" handler also bails on
            // Dropzone.CANCELED.
            canceled: (file) => {
                delete this.fileUploadStatus[file.name];
            },
            chunkSize: Number.MAX_SAFE_INTEGER,
            timeout: 2147483647
        });

        this.dz.on("processing", (file) => {
            if (!this.uploadToken) this.dz.cancelUpload(file);
            this.dz.options.url = `/share/upload/${this.uploadToken}`;
            this.fileUploadStatus[file.name] = 0;
        })
            .on("error", (file, res, xhr) => {

                if (res && res.noRetry) {
                    this.dz.cancelUpload(file);
                    this.error = `Failed to upload ${file.name}: ${res.error}`;
                    this.uploading = false;
                    file.status = Dropzone.CANCELED;
                    delete this.fileUploadStatus[file.name];
                    return;
                }

                // Stash status/Retry-After for the "complete" handler, which owns the actual
                // retry-count bookkeeping and re-queueing.
                file._lastStatus = xhr ? xhr.status : 0;
                file._retryAfterSeconds = xhr
                    ? this.resilience.parseRetryAfterSeconds(xhr.getResponseHeader && xhr.getResponseHeader('Retry-After'))
                    : null;
            })
            .on("uploadprogress", (file, progress, bytesSent) => {
                const now = new Date().getTime();

                if (bytesSent > file.size) bytesSent = file.size;

                if (progress === 100 || now - this.lastUpdated > 500) {
                    const deltaBytesSent = bytesSent - file.deltaBytesSent;
                    file.trackedBytesSent += deltaBytesSent;

                    this.totalBytesSent = this.totalBytesSent + deltaBytesSent;
                    this.lastUpdated = now;
                    this.fileUploadStatus[file.name] = progress;
                    file.deltaBytesSent = bytesSent;
                }
            })
            .on("addedfiles", async (files) => {
                this.filesCount = this.filesCount + files.length;

                this.totalBytes = 0;
                this.totalBytesSent = 0;

                for (let i = 0; i < files.length; i++) {
                    this.totalBytes += files[i].size;
                    files[i].deltaBytesSent = 0;
                    files[i].trackedBytesSent = 0;
                    files[i].retries = 0;
                }

                try {
                    this.uploading = true;
                    const r = await reg.makeRequest('/share/init', "POST");
                    this.uploadToken = r.token;
                    this.dz.processQueue();
                } catch (e) {
                    this.error = `Cannot initialize upload: ${e.message}`;
                    this.uploading = false;
                }
            })
            .on("complete", (file) => {
                if (file.status === "success") {
                    this.uploadedFiles = this.uploadedFiles + 1;
                    this.applyAimd('success');

                    // Update progress by removing the tracked progress and
                    // use the file size as the true number of bytes
                    this.totalBytesSent = this.totalBytesSent + file.size;
                    if (file.trackedBytesSent) this.totalBytesSent -= file.trackedBytesSent;
                    delete this.fileUploadStatus[file.name];
                    this.scheduleProcessQueue(100);
                    return;
                }

                // dropzone also emits "complete" for user cancellations (canceled ->
                // complete is wired in its init). A cancellation is not a failure:
                // no AIMD signaling, no error, no re-queue, no timer
                if (file.status === Dropzone.CANCELED) {
                    delete this.fileUploadStatus[file.name];
                    return;
                }

                // Only parse a plausible JSON body: on network failures xhr.response
                // is "" (JSON.parse would throw SyntaxError) and on cancellation
                // file.xhr may be undefined (TypeError). Anything else degrades to
                // res = null, which flows into the status-0 retry branch below
                var res = null;
                if (file.xhr && file.xhr.status >= 0
                    && typeof file.xhr.response === "string"
                    && (file.xhr.response[0] === "{" || file.xhr.response[0] === "[")) {
                    try {
                        res = JSON.parse(file.xhr.response);
                    } catch (e) { /* noop */ }
                }
                if (res && res.noRetry) {
                    delete this.fileUploadStatus[file.name];
                    return; // already canceled by the "error" handler
                }

                const status = file._lastStatus ?? (file.xhr ? file.xhr.status : 0);
                const canRetry = this.resilience.shouldRetryStatus(status) && file.retries < this.resilience.maxRetries;

                delete this.fileUploadStatus[file.name];

                if (!canRetry) {
                    this.dz.cancelUpload(file);
                    this.error = `Failed to upload ${file.name} (status ${status})`;
                    // A permanent failure for this file. Advance the queue so any
                    // still-queued files complete (autoProcessQueue is off, so without
                    // this they would sit abandoned); `queuecomplete` clears the
                    // uploading state once Dropzone has nothing left queued or in
                    // flight, so the spinner resets even on partial failure.
                    this.scheduleProcessQueue(0);
                    return;
                }

                this.applyAimd('failure');

                // Update progress
                this.totalBytesSent = this.totalBytesSent - file.trackedBytesSent;
                file.status = Dropzone.QUEUED;
                file.deltaBytesSent = 0;
                file.trackedBytesSent = 0;
                // computeRetryDelayMs takes a 0-based attempt, so use the counter
                // BEFORE incrementing (first retry -> attempt 0 -> base backoff, not
                // 2x base)
                const delay = this.resilience.computeRetryDelayMs(file.retries, file._retryAfterSeconds);
                file.retries++;
                this.scheduleProcessQueue(delay);
            })
            .on("sending", (file, xhr, formData) => {
                // Send filename
                formData.append("path", file.name);
            })
            .on("queuecomplete", async (files) => {
                if (this._isUnmounted) return;
                // Treat this as the true terminal only when nothing is left queued or
                // in flight, so a failure followed by more uploads doesn't fire early
                const remaining = this.dz.getQueuedFiles().length + this.dz.getUploadingFiles().length;
                if (remaining > 0) return;
                // Commit only on full success
                if (this.uploadedFiles - this.filesCount === 0) {
                    try {
                        const r = await reg.makeRequest(`/share/commit/${this.uploadToken}`, "POST");
                        // The commit request is async; the component may unmount while it
                        // is in flight. The terminal redirect is only safe while we are
                        // still alive
                        if (r.url && !this._isUnmounted) {
                            location.href = r.url;
                        } else if (r.error) {
                            this.error = r.error;
                        } else {
                            this.error = `Cannot upload files: ${JSON.stringify(r)}`;
                        }
                    } catch (e) {
                        this.error = e.message;
                    }
                }
                // Always clear the uploading state now (success OR partial failure), so
                // a permanent failure doesn't leave the spinner up forever
                this.uploading = false;
            })
            .on("reset", () => {
                this.filesCount = 0;
                this.uploadedFiles = 0;
            });
    },
    beforeUnmount: function () {
        // Prevent ghost uploads: pending retry timers (Retry-After can be up to the
        // 5-minute cap) and the live dropzone must not keep working after the view
        // is gone. The unmount flag is set first so the canceled/complete events
        // triggered by dz.destroy() short-circuit instead of scheduling new timers
        this._isUnmounted = true;
        if (this._queueTimers) {
            this._queueTimers.forEach((timerId) => clearTimeout(timerId));
            this._queueTimers = [];
        }
        if (this.dz) {
            this.dz.destroy();
            this.dz = null;
        }
    },
    methods: {
        // Schedules Dropzone to pick up queued files; the timer is tracked so
        // beforeUnmount can cancel it. A destroyed dropzone is a safe no-op
        scheduleProcessQueue: function (delay) {
            if (this._isUnmounted) return;
            const timerId = setTimeout(() => {
                this._queueTimers.splice(this._queueTimers.indexOf(timerId), 1);
                if (this.dz) this.dz.processQueue();
            }, delay);
            this._queueTimers.push(timerId);
        },

        // Applies the AIMD decision to Dropzone's live-read parallelUploads option
        // (it is read from options on every processQueue(), not cached).
        applyAimd: function (outcome) {
            const next = outcome === 'success' ? this.resilience.aimd.onSuccess() : this.resilience.aimd.onFailure();
            if (this.dz) this.dz.options.parallelUploads = next;
        },

        resetUpload: function () {
            this.filesCount = 0;
            this.totalBytes = 0;
            this.lastUpdated = 0;
            this.totalBytesSent = 0;
            this.url = "";
            this.error = "";
            this.uploading = false;
            this.uploadToken = null;
            this.uploadedFiles = 0;
            this.fileUploadStatus = {};
            if (this.dz) this.dz.removeAllFiles(true);
        },

        handleCancel: function () {
            this.resetUpload();
        },

        handleUpload: function () {
            this.dz.removeAllFiles(true);
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
