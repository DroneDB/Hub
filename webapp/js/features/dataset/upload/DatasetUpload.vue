<template>
    <div id="upload-dialog">

        <!-- Waiting for file selection -->
        <template v-if="waitingForFiles">
            <div class="file-selection-screen">
                <div class="selection-content">
                    <i class="fa-solid fa-cloud-arrow-up huge" />
                    <h3>Select files to upload</h3>
                    <p>Choose files or folders to upload to this dataset</p>
                    <div class="selection-buttons">
                        <Button icon="fa-solid fa-file" label="Select Files" @click="openFilePicker" />
                        <Button severity="secondary" icon="fa-solid fa-folder" label="Select Folder" @click="openFolderPicker" />
                        <Button severity="secondary" icon="fa-solid fa-link" label="Import from URL" @click="$emit('importFromUrl')" />
                    </div>
                </div>
                <!-- Chunked uploads that the server still stores (a reload, a closed tab): select the same file again to go on -->
                <section v-if="openUploads.length" class="open-uploads" aria-labelledby="open-uploads-title">
                    <h4 id="open-uploads-title">Interrupted uploads</h4>
                    <p>Select the same file again to go on from the part the server stored.</p>
                    <ul>
                        <li v-for="open in openUploads" :key="open.fileId" class="open-upload">
                            <span class="open-upload-name" :title="open.path">{{ open.sourceFileName || open.path }}</span>
                            <span class="open-upload-state">{{ bytesToSize(open.totalFileSize) }}, {{ storedPercent(open) }}% stored</span>
                            <Button size="small" icon="fa-solid fa-play" label="Resume" @click="openFilePicker" />
                            <Button size="small" severity="secondary" text icon="fa-regular fa-trash-can" label="Discard"
                                    :aria-label="'Discard the interrupted upload of ' + (open.sourceFileName || open.path)"
                                    @click="discardOpen(open)" />
                        </li>
                    </ul>
                </section>
            </div>
        </template>

        <!-- Upload progress view -->
        <template v-else>
            <div class="upload-header">
                <div class="upload-filters">
                    <Button class="filter-btn filter-all" :class="{ active: activeFilter === 'all' }" text
                            :severity="activeFilter === 'all' ? 'secondary' : 'secondary'" @click="activeFilter = 'all'">
                        <i class="fa-solid fa-file" />
                        <span class="filter-label">All</span>
                        <span class="filter-count">{{ counts.total }}</span>
                    </Button>
                    <Button v-if="!done || counts.error > 0" class="filter-btn filter-uploading" :class="{ active: activeFilter === 'uploading' }" text
                            :severity="activeFilter === 'uploading' ? undefined : 'secondary'" @click="activeFilter = 'uploading'">
                        <i class="fa-solid fa-circle-notch" :class="{ 'fa-spin': counts.uploading + counts.processing > 0 }" />
                        <span class="filter-label">In Progress</span>
                        <span class="filter-count">{{ counts.uploading + counts.processing + counts.pending }}</span>
                    </Button>
                    <Button class="filter-btn filter-done" :class="{ active: activeFilter === 'done' }" text
                            :severity="activeFilter === 'done' ? 'success' : 'secondary'" @click="activeFilter = 'done'">
                        <i class="fa-solid fa-check" />
                        <span class="filter-label">Done</span>
                        <span class="filter-count">{{ counts.done }}</span>
                    </Button>
                    <Button v-if="counts.error > 0" class="filter-btn filter-error" :class="{ active: activeFilter === 'error', 'has-errors': counts.error > 0 }" text
                            :severity="activeFilter === 'error' ? 'danger' : 'secondary'" @click="activeFilter = 'error'">
                        <i class="fa-solid fa-xmark" />
                        <span class="filter-label">Errors</span>
                        <span class="filter-count">{{ counts.error }}</span>
                    </Button>
                </div>
            </div>

            <div class="upload-body">
                <p v-if="checkingNames" class="checking-names">
                    <i class="fa-solid fa-circle-notch fa-spin" /> Looking for files with the same names in the destination...
                </p>
                <VirtualScroller
                    v-slot="{ item }"
                    class="file-list-scroller"
                    :items="filteredFiles"
                    :item-size="48"
                >
                    <FileUploadRow :file="item" @retry="retryFile" />
                </VirtualScroller>
            </div>

            <div class="upload-footer">
                <div v-if="uploading" class="total-progress-container">
                    <div class="progress-info">
                        <span>{{ humanBytesSent }} / {{ humanTotalBytes }}</span>
                        <span>{{ totalProgress.toFixed(1) }}%</span>
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

                <!-- Upload summary stats (shown when done) -->
                <div v-if="done" class="upload-summary">
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <i class="fa-regular fa-clock" />
                            <span class="stat-label">Duration:</span>
                            <span class="stat-value">{{ uploadDuration }}</span>
                        </div>
                        <div class="summary-stat">
                            <i class="fa-solid fa-database" />
                            <span class="stat-label">Transferred:</span>
                            <span class="stat-value">{{ humanTransferred }}</span>
                        </div>
                        <div class="summary-stat">
                            <i class="fa-solid fa-gauge" />
                            <span class="stat-label">Average speed:</span>
                            <span class="stat-value">{{ averageSpeed }}</span>
                        </div>
                    </div>
                    <div class="upload-result" :class="{ success: counts.error === 0, 'has-errors': counts.error > 0 }">
                        <template v-if="counts.error === 0">
                            <i class="fa-solid fa-circle-check" /> All {{ counts.done }} files uploaded successfully!
                        </template>
                        <template v-else>
                            <i class="fa-solid fa-triangle-exclamation" /> {{ counts.done }} succeeded, {{ counts.error }} failed
                        </template>
                    </div>
                    <p v-if="counts.error > 0 && retryableCount === 0" class="no-retry-reason">
                        <i class="fa-solid fa-circle-info" />
                        {{ counts.error === 1 ? 'The failed file was refused' : 'The failed files were refused' }}:
                        sending {{ counts.error === 1 ? 'it' : 'them' }} again would fail the same way. The reason is on each file.
                    </p>
                    <router-link class="diagnostics-link" :to="{ name: 'Account', hash: '#upload-diagnostics' }">
                        <i class="fa-solid fa-stethoscope" /> Uploads slower than expected? Test the connection
                    </router-link>
                </div>

                <div class="upload-actions">
                    <Button v-if="uploading" severity="danger" icon="fa-regular fa-circle-stop" label="Cancel Upload" :title="counts.processing > 0 ? 'Files already sent are still added to the dataset by the server' : 'The files already sent stay in the dataset'"
                            @click="handleCancel" />
                    <Button v-if="uploading" severity="secondary" :icon="paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'"
                            :label="paused ? 'Resume' : 'Pause'" @click="togglePause" />
                    <!-- The upload goes on while the user uses the rest of the Hub; the header shows it -->
                    <Button v-if="uploading" severity="secondary" icon="fa-solid fa-angles-down" label="Continue in background"
                            title="The upload goes on; the header shows its progress" @click="runInBackground" />

                    <template v-if="done">
                        <Button v-if="retryableCount > 0" icon="fa-solid fa-rotate-right"
                                :label="'Retry Failed (' + retryableCount + ')'" @click="retryAllFailed" />
                        <Button severity="secondary" icon="fa-solid fa-check" label="Close" @click="finishUpload" />
                    </template>
                </div>
            </div>
        </template><!-- end upload progress view -->

        <!-- Names that exist in the destination: asked before the files are queued (and again after a 409) -->
        <PasteConflictDialog v-if="conflictPrompt" verb="upload" keep-both :items="conflictPrompt.items"
                             @resolve="conflictPrompt.resolve" />
    </div>
</template>

<script>
import FileUploadRow from './FileUploadRow.vue';
import PasteConflictDialog from '@/features/dataset/dialogs/PasteConflictDialog.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import Button from 'primevue/button';
import { bytesToSize } from '@/libs/utils';
import { freeName, namesClash } from '@/libs/nameRules';
import { orderCompanionsFirst } from '@/libs/uploadOrder';
import { useUploadsStore } from '@/stores/uploads';
import { notify } from '@/libs/notify';
import { matchOpenUploads, storedPercent } from '@/libs/upload/openUploads';
import { formatDurationSeconds } from '@/libs/format';
import reg from '@/libs/api/sharedRegistry';
import { markRaw } from 'vue';

const EMPTY_COUNTS = { total: 0, pending: 0, uploading: 0, processing: 0, done: 0, error: 0 };

const parentOf = path => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const nameOf = path => path.slice(path.lastIndexOf('/') + 1);
const joinPath = (folder, name) => (folder ? `${folder}/${name}` : name);

/**
 * DatasetUpload - upload panel for adding files to a dataset.
 *
 * Presentation over the upload queue of the dataset (useUploadQueue, kept by the app-wide store of stores/uploads.js):
 * requests start as soon as a slot frees, small files go in bundles, large ones as resumable chunks, and a file whose
 * bytes are all sent shows "Processing on server" until the server has added it.
 *
 * The queue outlives this dialog (FR-UPL-04): "Continue in background" closes it and the upload goes on, also on
 * another page (the header shows it); Pause and Resume stop and restart it; Cancel stops it and removes the chunks the
 * server stores (the files already sent stay). After a reload the dialog offers the chunked uploads that the server
 * still stores: a file selected again that has the source name, size and last-modified time of one of them resumes it,
 * at the path it was started at, before the question about names that exist.
 *
 * Names that exist (FR-UPL-03, AC-023): before the files are queued, each destination folder is
 * listed once, and the files whose names exist there (by the case rule of D-040) go to one prompt:
 * Replace (sent with overwrite), Keep both (a free name from freeName) or Skip (not sent). A file
 * the Registry still refuses with 409 and conflictPath (another upload took the name meanwhile)
 * goes back to the prompt once.
 */
export default {
    components: {
        FileUploadRow,
        PasteConflictDialog,
        VirtualScroller,
        Button
    },
    props: {
        organization: { type: String, required: true },
        dataset: { type: String, required: true },
        path: { type: String, default: null },
        filesToUpload: { type: Array, default: null }
    },
    emits: ['close', 'upload', 'update:closable', 'update:waitingForFiles', 'importFromUrl'],
    data: function () {
        return {
            error: null,
            activeFilter: 'uploading',
            waitingForFiles: false,  // True when waiting for user to select files
            checkingNames: false,    // Listing the destination folders before the files are queued
            conflictPrompt: null,    // { items, resolve } while the conflict prompt is open
            // The dataset's queue, kept by the store; read with the data, before the watchers read it; raw: its
            // state ref is the reactive part
            queue: markRaw(useUploadsStore().queueFor(this.organization, this.dataset)),
            // The chunked uploads that the server stores for this dataset and no queue holds (the resume offer)
            openUploads: [],
            // One prompt at a time; files that 409 wait here for it, each once (raw: bookkeeping)
            prompts: markRaw({ chain: Promise.resolve(), raced: [], reprompted: new Set(), closed: false }),
            // Stops listening to the store; the list of open uploads being read; the session the dialog was opened
            // in (raw: bookkeeping)
            hooks: markRaw({ unsubscribe: null, opened: Promise.resolve(), session: 0 })
        }
    },
    computed: {
        snapshot() {
            return this.queue.state.value;
        },
        counts() {
            return this.snapshot?.counts ?? EMPTY_COUNTS;
        },
        uploading() {
            return this.counts.total > 0 && !this.done;
        },
        done() {
            return this.counts.total > 0 && this.snapshot?.done === true;
        },
        paused() {
            return this.snapshot?.paused === true;
        },
        // Every byte is sent: what is left is the server adding the files
        allSent() {
            return this.snapshot != null && this.snapshot.bytesSent >= this.snapshot.totalBytes;
        },
        filteredFiles() {
            const filter = this.activeFilter;
            return this.queue.rows(f => filter === 'all' ||
                (filter === 'uploading' ? ['uploading', 'processing', 'pending'].includes(f.status) : f.status === filter));
        },
        humanTotalBytes() {
            return bytesToSize(this.snapshot?.totalBytes ?? 0);
        },
        // What was added to the dataset: the files that are done, not what was sent and refused
        humanTransferred() {
            return bytesToSize(this.snapshot?.doneBytes ?? 0);
        },
        // The failed files that can succeed when sent again (a refusal has noRetry)
        retryableCount() {
            if (!this.counts.error) return 0;
            return (this.snapshot?.items ?? []).filter(i => i.status === 'error' && i.canRetry).length;
        },
        humanBytesSent() {
            return bytesToSize(this.snapshot?.bytesSent ?? 0);
        },
        totalProgress() {
            const total = this.snapshot?.totalBytes ?? 0;
            return total === 0 ? 0 : (this.snapshot.bytesSent / total) * 100.0;
        },
        uploadDuration() {
            const start = this.snapshot?.startedAt;
            if (!start) return '0s';
            return formatDurationSeconds(((this.snapshot.endedAt ?? Date.now()) - start) / 1000);
        },
        averageSpeed() {
            const s = this.snapshot;
            if (!s?.startedAt || !s.endedAt || s.endedAt <= s.startedAt) return '0 B/s';
            return bytesToSize((s.bytesSent / (s.endedAt - s.startedAt)) * 1000) + '/s';
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
    },
    watch: {
        waitingForFiles(val) {
            this.$emit('update:waitingForFiles', val);
        },
        uploading(val) {
            this.$emit('update:closable', !val);
        },
        done(val) {
            // Switch to the tab that matters once everything settled
            if (val) this.activeFilter = this.counts.error > 0 ? 'error' : 'done';
        }
    },
    created() {
        const uploads = useUploadsStore();
        // Its queue is this session's: files chosen in it are not queued once it has ended (enqueue)
        this.hooks.session = uploads.session();
        uploads.attach(this.organization, this.dataset);
        this.hooks.unsubscribe = uploads.subscribe(this.organization, this.dataset, {
            added: entries => entries.forEach(entry => this.$emit('upload', entry)),
            failed: item => this.onItemFailed(item)
        });
    },
    mounted() {
        // The server's open uploads (after a reload): read once, before the files are matched to them
        this.hooks.opened = this.loadOpenUploads();

        // The dialog of a dataset that is uploading (opened again, or after "Continue in background"): its progress
        if (this.counts.total > 0) {
            this.waitingForFiles = false;
            this.$emit('update:closable', !this.uploading);
            if (this.filesToUpload != null && this.filesToUpload.length > 0) this.enqueue(this.filesToUpload);
            return;
        }

        // Dialog starts not closable during upload
        this.$emit('update:closable', false);

        if (this.filesToUpload != null && this.filesToUpload.length > 0) {
            this.waitingForFiles = false;
            this.enqueue(this.filesToUpload);
        } else {
            // No files passed, show file selection screen
            this.waitingForFiles = true;
            this.$emit('update:closable', true);
        }
    },
    beforeUnmount() {
        // The upload does not stop with the dialog (FR-UPL-04): the queue is the store's, and Cancel is a button
        this.prompts.closed = true;
        this.hooks.unsubscribe?.();
        useUploadsStore().detach(this.organization, this.dataset);
    },
    methods: {
        bytesToSize,
        storedPercent,

        async loadOpenUploads() {
            this.openUploads = await useUploadsStore().listOpen(this.organization, this.dataset);
        },

        async discardOpen(open) {
            try {
                await useUploadsStore().discardOpen(this.organization, this.dataset, open.fileId);
                this.openUploads = this.openUploads.filter(o => o.fileId !== open.fileId);
            } catch (e) {
                console.warn('Could not discard the interrupted upload:', e);
                notify.error(e, { summary: 'Interrupted upload' });
            }
        },

        datasetApi() {
            return reg.Organization(this.organization).Dataset(this.dataset);
        },

        /**
         * Whether what the dialog began must stop: it is closing, or the session it was opened in has ended (the
         * listing and the prompt take time; signing out, or a 401 meanwhile, ends the session).
         */
        abandoned() {
            return this.prompts.closed || useUploadsStore().session() !== this.hooks.session;
        },

        // Companions (.mtl, textures, ...) are queued before 3D models (best effort)
        async enqueue(fileList) {
            const selected = orderCompanionsFirst(Array.from(fileList).map(file => {
                // webkitRelativePath holds the folder structure of a folder pick
                if (file.webkitRelativePath && !file.fullPath) file.fullPath = file.webkitRelativePath;
                return file;
            }));

            // A file that has the source name, size and last-modified time of an open upload resumes it, at the path it
            // was started at (Keep both may have renamed it): before the names are checked, its own chunks are no clash
            await this.hooks.opened;
            if (this.abandoned()) return;
            const { resumed, rest: files } = matchOpenUploads(this.openUploads, selected);
            if (resumed.length) {
                const used = new Set(resumed.map(r => r.open.fileId));
                this.openUploads = this.openUploads.filter(o => !used.has(o.fileId));
            }
            const resuming = resumed.map(({ file, open }) => ({ file, path: open.path, fileId: open.fileId }));

            const planned = files.map(file => {
                const filePath = file.fullPath || file.name;
                return { file, path: !this.path ? filePath : (this.path + "/" + filePath) };
            });

            // The names in each destination folder, before a byte is sent
            this.checkingNames = true;
            let names;
            try {
                names = await this.namesInFolders(planned.map(p => parentOf(p.path)));
            } finally {
                this.checkingNames = false;
            }
            if (this.abandoned()) return;
            const conflicts = planned.filter(p => names.get(parentOf(p.path)).some(n => namesClash(n, nameOf(p.path))));

            let choices = [];
            if (conflicts.length) {
                choices = await this.askConflicts(conflicts.map(p => ({ path: p.path })));
                if (this.abandoned()) return;
                if (choices === 'cancel') {
                    // The files that resume are not part of the question: they go on
                    if (resuming.length) useUploadsStore().add(this.organization, this.dataset, resuming, { session: this.hooks.session });
                    return this.nothingQueued();
                }
            }
            const choiceOf = new Map(conflicts.map((p, i) => [p, choices[i]]));

            // Keep both: a name that neither the folder nor another file of this upload has
            const taken = new Map();
            for (const p of planned) {
                const folder = parentOf(p.path);
                if (!taken.has(folder)) taken.set(folder, [...names.get(folder)]);
                taken.get(folder).push(nameOf(p.path));
            }

            const queued = [...resuming];
            for (const p of planned) {
                const choice = choiceOf.get(p);
                if (choice === 'skip') continue;
                if (choice === 'replace') {
                    queued.push({ ...p, overwrite: true });
                } else if (choice === 'keep') {
                    const folder = parentOf(p.path);
                    const name = freeName(nameOf(p.path), taken.get(folder));
                    taken.get(folder).push(name);
                    queued.push({ file: p.file, path: joinPath(folder, name) });
                } else {
                    queued.push(p);
                }
            }

            if (queued.length) useUploadsStore().add(this.organization, this.dataset, queued, { session: this.hooks.session });
            else this.nothingQueued();
        },

        // Every file was skipped (or the prompt cancelled): back to the file selection when nothing runs
        nothingQueued() {
            if (this.counts.total > 0) return;
            this.waitingForFiles = true;
            this.$emit('update:closable', true);
        },

        /**
         * The entry names of each folder (one listing per folder). A folder that its parent does not
         * have is new: nothing to list. A listing that fails counts as empty (the Registry still refuses
         * a name that exists, and the file comes back to the prompt).
         * @param {string[]} folders
         * @returns {Promise<Map<string, string[]>>}
         */
        async namesInFolders(folders) {
            const dataset = this.datasetApi();
            const base = this.path || '';
            const memo = new Map();
            const namesIn = folder => {
                if (!memo.has(folder)) memo.set(folder, (async () => {
                    if (folder !== base && folder !== '') {
                        const parentNames = await namesIn(parentOf(folder));
                        if (!parentNames.some(n => namesClash(n, nameOf(folder)))) return [];
                    }
                    try {
                        return ((await dataset.list(folder || undefined)) || []).map(e => nameOf(e.path));
                    } catch (e) {
                        console.warn(`Could not list the upload destination "${folder}":`, e);
                        return [];
                    }
                })());
                return memo.get(folder);
            };

            const unique = [...new Set(folders)];
            const lists = await Promise.all(unique.map(namesIn));
            return new Map(unique.map((folder, i) => [folder, lists[i]]));
        },

        /**
         * Opens the conflict prompt for `items` (after any prompt already open).
         * @param {Array<{ path: string }>} items
         * @returns {Promise<'cancel'|Array<'replace'|'keep'|'skip'>>}
         */
        askConflicts(items) {
            const asked = this.prompts.chain.then(() => new Promise(resolve => {
                this.conflictPrompt = {
                    items,
                    resolve: choice => {
                        this.conflictPrompt = null;
                        resolve(choice);
                    }
                };
            }));
            this.prompts.chain = asked.catch(() => {});
            return asked;
        },

        // A 409 with conflictPath: another upload took the name after the check; ask once more
        onItemFailed(item) {
            if (!item.conflictPath || this.prompts.reprompted.has(item.id)) return;
            this.prompts.reprompted.add(item.id);
            this.prompts.raced.push({ id: item.id, path: item.path, conflictPath: item.conflictPath });
            // Several files of one run that clash go to one prompt
            if (this.prompts.raced.length === 1) queueMicrotask(() => this.askRaced());
        },

        async askRaced() {
            const raced = this.prompts.raced.splice(0);
            if (!raced.length || this.prompts.closed) return;
            const choices = await this.askConflicts(raced.map(r => ({ path: r.path })));
            if (choices === 'cancel' || this.abandoned()) return;

            // Keep both: a name that the folder, the files of this upload and the names chosen here do not have
            const keep = raced.filter((_, i) => choices[i] === 'keep');
            const listed = await this.namesInFolders(keep.map(r => parentOf(r.path)));
            if (this.abandoned()) return;
            const queued = this.queue.rows().map(row => row.path);
            const taken = folder => {
                const names = [...listed.get(folder)];
                for (const path of queued) if (parentOf(path) === folder) names.push(nameOf(path));
                return names;
            };
            const takenIn = new Map();

            for (const [i, r] of raced.entries()) {
                // Skip: the row keeps its reason
                if (choices[i] === 'replace') {
                    this.queue.requeue(r.id, { overwrite: true });
                } else if (choices[i] === 'keep') {
                    const folder = parentOf(r.path);
                    if (!takenIn.has(folder)) takenIn.set(folder, taken(folder));
                    const siblings = takenIn.get(folder);
                    const name = freeName(nameOf(r.path), [...siblings, nameOf(r.conflictPath)]);
                    siblings.push(name);
                    this.queue.requeue(r.id, { path: joinPath(folder, name), overwrite: false });
                }
            }
        },

        retryFile(file) {
            this.queue.retry(file.id);
        },

        retryAllFailed() {
            this.queue.retryFailed();
        },

        // Stops the queue and removes the chunks the server stores; the files already sent stay (D-045)
        async handleCancel() {
            await useUploadsStore().cancel(this.organization, this.dataset);
            this.$emit('update:closable', true);
            this.$emit('close');
        },

        togglePause() {
            const uploads = useUploadsStore();
            if (this.paused) uploads.resume(this.organization, this.dataset);
            else uploads.pause(this.organization, this.dataset);
        },

        // The queue is the store's: closing the dialog leaves it running
        runInBackground() {
            this.$emit('update:closable', true);
            this.$emit('close');
        },

        finishUpload() {
            this.$emit('close');
        },

        // File picker methods
        openFilePicker() {
            this.pickFiles(false);
        },

        openFolderPicker() {
            this.pickFiles(true);
        },

        pickFiles(folder) {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.webkitdirectory = folder;
            input.style.display = 'none';
            // lifetime: element (a one-shot file input created here)
            input.addEventListener('change', (e) => {
                this.handleFileInputChange(e);
                document.body.removeChild(input);
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        },

        handleFileInputChange(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            this.waitingForFiles = false;
            this.$emit('update:closable', false);
            this.enqueue(files);

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
    min-width: min(31.25rem, var(--window-content-width, 100%));
    max-width: 50rem;
    min-height: 18.75rem;
    max-height: 80vh;
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

.checking-names {
    margin: var(--ddb-spacing-md);
    color: var(--ddb-text-secondary);
}

.no-retry-reason {
    margin: var(--ddb-spacing-sm) 0 0 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
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

.upload-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    justify-content: flex-end;
}

.upload-result {
    flex: 1;
    font-size: var(--ddb-font-size-base);
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.upload-result.success {
    color: var(--ddb-success-text);
}

.upload-result.has-errors {
    color: var(--ddb-warning-text);
}

/* Spinning animation */
/* File selection screen */
.file-selection-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ddb-spacing-xl) 3.75rem;
    min-width: min(25rem, var(--window-content-width, 100%));
}

.selection-content {
    text-align: center;
    padding: var(--ddb-spacing-xl);
}

.selection-content .icon.cloud.upload {
    color: var(--ddb-primary);
    margin-bottom: 1rem;
}

.selection-content h3 {
    margin: 0 0 var(--ddb-spacing-sm) 0;
    font-size: 1.25rem;
    color: var(--ddb-text);
}

.selection-content p {
    margin: 0 0 var(--ddb-spacing-xl) 0;
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
}

/* Chunked uploads the server still stores (a reload, a closed tab) */
.open-uploads {
    width: 100%;
    border-top: var(--ddb-border-width) solid var(--ddb-border);
    padding-top: var(--ddb-spacing-md);
}

.open-uploads h4 {
    margin: 0 0 var(--ddb-spacing-xs) 0;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text);
}

.open-uploads p {
    margin: 0 0 var(--ddb-spacing-sm) 0;
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
}

.open-uploads ul {
    list-style: none;
    margin: 0;
    padding: 0;
}

.open-upload {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xs) 0;
}

.open-upload-name {
    flex: 1 1 8rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ddb-text);
}

.open-upload-state {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
}

.selection-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-bottom: 1.5rem;
}

/* Upload summary */
.upload-summary {
    border-radius: var(--ddb-radius-sm);
}

.summary-stats {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--ddb-spacing-md);
    flex-wrap: wrap;
    gap: var(--ddb-spacing-md);
}

.summary-stat {
    display: flex;
    gap: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-base);
    align-items: center;
}

.summary-stat .icon {
    color: var(--ddb-text-secondary);
}

.summary-stat .stat-label {
    color: var(--ddb-text-secondary);
}

.summary-stat .stat-value {
    font-weight: 600;
    color: var(--ddb-text);
}

.upload-summary .upload-result {
    text-align: center;
    padding-top: var(--ddb-spacing-md);
    margin-top: var(--ddb-spacing-xs);
}
.diagnostics-link {
    display: inline-block;
    margin-top: var(--ddb-spacing-sm);
    font-size: 0.8rem;
    color: var(--ddb-text-muted);
}

/* A phone: the selection screen uses the whole width of the window */
@media only screen and (max-width: 575.98px) {
    .file-selection-screen {
        padding-inline: 0;
    }

    .selection-content {
        padding-inline: 0;
    }
}
</style>
