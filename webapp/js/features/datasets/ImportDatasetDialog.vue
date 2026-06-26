<template>
    <Window :title="title" id="importDatasetDialog" @onClose="onWindowClose" modal maxWidth="70%" fixedSize>
        <div class="import-dialog">
            <!-- Configure + verify -->
            <div v-if="!importing">
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Source</label>
                    <Select v-model="sourceType" :options="sourceOptions" optionLabel="label" optionValue="type"
                        @change="onSourceChange" class="w-100" :disabled="verifying" placeholder="Select a source" />
                    <small v-if="selectedSource" class="text-muted">{{ selectedSource.description }}</small>
                </div>

                <!-- Registry source: enhanced UI with org/dataset browsing -->
                <template v-if="sourceType === 'registry' && selectedSource">
                    <div class="mb-3">
                        <label class="d-block mb-1 fw-semibold">Registry URL <span class="text-danger">*</span></label>
                        <InputText v-model="params.url" placeholder="https://hub.dronedb.app" class="w-100"
                            :disabled="verifying" @input="onRemoteUrlChange" @keyup.enter="canVerify && verify()" />
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col">
                            <label class="d-block mb-1 fw-semibold">Username</label>
                            <InputText v-model="params.username" placeholder="optional" class="w-100"
                                :disabled="verifying" @keyup.enter="canVerify && verify()" />
                        </div>
                        <div class="col">
                            <label class="d-block mb-1 fw-semibold">Password</label>
                            <InputText v-model="params.password" type="password" placeholder="optional" class="w-100"
                                :disabled="verifying" @keyup.enter="canVerify && verify()" />
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="d-block mb-1 fw-semibold">Organization <span class="text-danger">*</span></label>
                        <div class="d-flex gap-2">
                            <Select v-if="remoteOrgs !== null" v-model="params.organization"
                                :options="remoteOrgs" optionLabel="label" optionValue="value"
                                placeholder="Select an organization" class="flex-grow-1"
                                :disabled="verifying || browsingOrgs" @change="onRemoteOrgChange" />
                            <InputText v-else v-model="params.organization" placeholder="organization slug"
                                class="flex-grow-1" :disabled="verifying || browsingOrgs"
                                @keyup.enter="canVerify && verify()" />
                            <Button icon="fa-solid fa-list" severity="secondary" :loading="browsingOrgs"
                                :disabled="!canBrowseOrgs || browsingOrgs" @click="browseOrgs"
                                title="Browse organizations" />
                        </div>
                        <small v-if="browseOrgsError" class="text-danger">{{ browseOrgsError }}</small>
                    </div>
                    <div class="mb-3">
                        <label class="d-block mb-1 fw-semibold">Dataset <span class="text-danger">*</span></label>
                        <div class="d-flex gap-2">
                            <Select v-if="remoteDatasets !== null" v-model="params.dataset"
                                :options="remoteDatasets" optionLabel="label" optionValue="value"
                                placeholder="Select a dataset" class="flex-grow-1"
                                :disabled="verifying || browsingDatasets" />
                            <InputText v-else v-model="params.dataset" placeholder="dataset slug"
                                class="flex-grow-1" :disabled="verifying || browsingDatasets"
                                @keyup.enter="canVerify && verify()" />
                            <Button icon="fa-solid fa-list" severity="secondary" :loading="browsingDatasets"
                                :disabled="!canBrowseDatasets || browsingDatasets" @click="browseDatasets"
                                title="Browse datasets" />
                        </div>
                        <small v-if="browseDatasetsError" class="text-danger">{{ browseDatasetsError }}</small>
                    </div>
                </template>

                <!-- Generic fields for all other source types -->
                <template v-else>
                    <div v-for="f in selectedSource ? selectedSource.fields : []" :key="f.name" class="mb-3">
                        <label class="d-block mb-1 fw-semibold">
                            {{ f.label }}<span v-if="f.required" class="text-danger"> *</span>
                        </label>
                        <InputText v-model="params[f.name]" :type="f.type === 'password' ? 'password' : 'text'"
                            :placeholder="f.placeholder" class="w-100" :disabled="verifying"
                            @keyup.enter="canVerify && verify()" />
                    </div>
                </template>

                <div class="d-flex gap-2">
                    <Button label="Verify" icon="fa-solid fa-plug" severity="secondary"
                        :disabled="!canVerify || verifying" :loading="verifying" @click="verify" />
                </div>

                <PrimeMessage v-if="verifyError" severity="error" :closable="false" class="mt-3">
                    {{ verifyError }}
                </PrimeMessage>

                <div v-if="verifyResult && verifyResult.reachable" class="verify-result mt-3">
                    <PrimeMessage severity="success" :closable="false">Source reachable</PrimeMessage>

                    <div class="verify-stats mt-2 d-flex flex-wrap gap-3">
                        <span v-if="verifyResult.fileCount != null" class="verify-stat">
                            <i class="fa-solid fa-file"></i>
                            {{ verifyResult.fileCount }} file{{ verifyResult.fileCount === 1 ? '' : 's' }}
                        </span>
                        <span v-if="verifyResult.estimatedBytes != null" class="verify-stat">
                            <i class="fa-solid fa-database"></i> {{ bytesToSize(verifyResult.estimatedBytes) }}
                        </span>
                    </div>
                    <div v-if="verifyResult.note" class="mt-1">
                        <small class="text-muted"><i class="fa-solid fa-circle-info"></i> {{ verifyResult.note }}</small>
                    </div>

                    <div class="row g-3 mt-1">
                        <div class="col-md-6">
                            <label class="d-block mb-1 fw-semibold">Dataset Name</label>
                            <InputText v-model="name" placeholder="Dataset name" class="w-100" />
                        </div>
                        <div class="col-md-6">
                            <label class="d-block mb-1 fw-semibold">Visibility</label>
                            <Select v-model="visibility" :options="visibilityOptions" optionLabel="label"
                                optionValue="value" class="w-100" />
                        </div>
                    </div>
                    <div class="mb-2 mt-2">
                        <label class="d-block mb-1 fw-semibold">Slug</label>
                        <InputText v-model="slug" placeholder="dataset-slug" class="w-100" @input="slugEdited = true" />
                        <small v-if="slug && slugFormatInvalid" class="text-danger">
                            A slug may only contain lowercase letters, numbers, dashes and underscores.
                        </small>
                        <small v-else-if="slugTaken" class="text-danger">
                            A dataset with this slug already exists in this organization.
                        </small>
                    </div>
                </div>
            </div>

            <!-- Importing -->
            <div v-else class="importing">
                <div class="mb-2"><strong>Importing into "{{ slug }}"...</strong></div>
                <ProgressBar :value="progressPercent" />
                <div class="mt-2 small text-muted">
                    <span v-if="phaseLabel">{{ phaseLabel }}</span>
                    <span v-if="etaText"> - ETA {{ etaText }}</span>
                </div>
                <div v-if="logTail.length" class="import-log mt-2">
                    <div v-for="(line, i) in logTail.slice(-5)" :key="i">{{ line }}</div>
                </div>
            </div>

            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button v-if="!importing" @click="emitClose('close')" severity="secondary" label="Close" />
                <Button v-if="!importing" @click="startImport" severity="primary" icon="fa-solid fa-download"
                    :disabled="!canImport" :loading="submitting" label="Import" />
                <Button v-if="importing" @click="emitClose('background')" severity="secondary"
                    label="Run in background" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import { bytesToSize } from '@/libs/utils';
import { slugFromName } from '@/libs/api/registryUtils';
import reg from '@/libs/api/sharedRegistry';
import { Visibility } from 'ddb';
import useHeavyTask from '@/composables/useHeavyTask';
import { IMPORT_SOURCES, getImportSource } from './importSources';

const slugRe = /^[a-z0-9\-_]+$/;

/**
 * ImportDatasetDialog - Import a remote dataset (another Registry instance or a downloadable
 * archive) into a new dataset. Verifies the source, then creates an empty dataset and tracks
 * the import heavy task to completion.
 *
 * Props:
 *   orgSlug - Destination organization slug.
 *   forbiddenSlugs - Slugs already used in the organization (for client-side validation).
 */
export default {
    name: 'ImportDatasetDialog',
    mixins: [useHeavyTask],
    components: {
        Window, Select, InputText, Button, PrimeMessage, ProgressBar
    },
    props: {
        orgSlug: { type: String, required: true },
        forbiddenSlugs: { type: Array, default: () => [] }
    },
    emits: ['onClose'],

    data() {
        return {
            title: 'Import dataset',
            org: null,
            sourceOptions: [],
            sourceType: null,
            params: {},

            verifying: false,
            verifyResult: null,
            verifyError: null,

            // Remote browse state (registry source only)
            browsingOrgs: false,
            browseOrgsError: null,
            remoteOrgs: null,        // null = not yet browsed; [{label, value}] when loaded
            browsingDatasets: false,
            browseDatasetsError: null,
            remoteDatasets: null,    // null = not yet browsed; [{label, value}] when loaded

            name: '',
            slug: '',
            slugEdited: false,
            visibility: Visibility.PRIVATE,
            visibilityOptions: [
                { value: Visibility.PRIVATE, label: 'Private' },
                { value: Visibility.UNLISTED, label: 'Unlisted' },
                { value: Visibility.PUBLIC, label: 'Public' }
            ],

            submitting: false,
            importing: false,
            taskId: null,
            importStartTime: 0,
            progressPercent: 0,
            phase: null,
            logTail: [],
            etaText: ''
        };
    },

    async mounted() {
        this.org = reg.Organization(this.orgSlug);

        let enabled;
        try {
            enabled = await this.org.importSources();
        } catch (e) {
            // Fall back to the full catalog if the server does not expose the endpoint.
            enabled = IMPORT_SOURCES.map(s => s.type);
        }

        this.sourceOptions = IMPORT_SOURCES.filter(s => enabled.includes(s.type));
        if (this.sourceOptions.length) {
            this.sourceType = this.sourceOptions[0].type;
            this.onSourceChange();
        }
    },

    computed: {
        selectedSource() {
            return getImportSource(this.sourceType);
        },
        canBrowseOrgs() {
            return !!(this.params.url || '').trim();
        },
        canBrowseDatasets() {
            return !!(this.params.url || '').trim() && !!(this.params.organization || '').trim();
        },
        canVerify() {
            if (!this.selectedSource) return false;
            return this.selectedSource.fields
                .filter(f => f.required)
                .every(f => (this.params[f.name] || '').trim().length > 0);
        },
        slugFormatInvalid() {
            return !this.slug || !slugRe.test(this.slug);
        },
        slugTaken() {
            return !!this.slug && this.forbiddenSlugs.includes(this.slug);
        },
        slugInvalid() {
            return this.slugFormatInvalid || this.slugTaken;
        },
        canImport() {
            return !!(this.verifyResult && this.verifyResult.reachable)
                && (this.name || '').trim().length > 0
                && !this.slugInvalid
                && !this.submitting;
        },
        phaseLabel() {
            switch (this.phase) {
                case 'downloading': return 'Downloading files';
                case 'extracting': return 'Extracting archive';
                case 'fetching': return 'Fetching data';
                case 'indexing': return 'Indexing files';
                case 'cleanup': return 'Cleaning up';
                case 'done': return 'Finishing';
                default: return this.phase || '';
            }
        }
    },

    watch: {
        name(val) {
            if (!this.slugEdited) this.slug = this.uniqueSlug(slugFromName(val) || '');
        }
    },

    methods: {
        bytesToSize,

        // Returns the base slug, or the first free "<base>-N" variant when it is already in use,
        // so a fresh import (or a retry after a failed one) does not collide with an existing dataset.
        uniqueSlug(base) {
            if (!base) return '';
            if (!this.forbiddenSlugs.includes(base)) return base;
            for (let i = 2; i < 1000; i++) {
                const candidate = `${base}-${i}`;
                if (!this.forbiddenSlugs.includes(candidate)) return candidate;
            }
            return base;
        },

        onSourceChange() {
            // Reset the param object to just the fields of the selected source.
            const next = {};
            (this.selectedSource ? this.selectedSource.fields : []).forEach(f => { next[f.name] = ''; });
            this.params = next;
            this.verifyResult = null;
            this.verifyError = null;
            this.slugEdited = false;
            this._resetBrowseState();
        },

        // Resets all browse-related state (called on source change and URL edits).
        _resetBrowseState() {
            this.remoteOrgs = null;
            this.remoteDatasets = null;
            this.browseOrgsError = null;
            this.browseDatasetsError = null;
        },

        // Called when the URL field changes: invalidate any previously loaded org/dataset lists.
        onRemoteUrlChange() {
            this._resetBrowseState();
            this.params.organization = '';
            this.params.dataset = '';
            this.verifyResult = null;
        },

        // Called when the user selects an org from the browse dropdown: reset dataset browse.
        onRemoteOrgChange() {
            this.remoteDatasets = null;
            this.browseDatasetsError = null;
            this.params.dataset = '';
            this.verifyResult = null;
        },

        async browseOrgs() {
            this.browsingOrgs = true;
            this.browseOrgsError = null;
            this.remoteOrgs = null;
            this.remoteDatasets = null;
            this.params.organization = '';
            this.params.dataset = '';
            this.verifyResult = null;
            try {
                const res = await this.org.browseImport(this.sourceType, this.params, 'organizations');
                this.remoteOrgs = (res.items || []).map(o => ({
                    label: o.name ? `${o.name} (${o.slug})` : o.slug,
                    value: o.slug
                }));
                if (!this.remoteOrgs.length)
                    this.browseOrgsError = 'No accessible organizations found.';
            } catch (e) {
                this.browseOrgsError = e.message || 'Failed to load organizations.';
            } finally {
                this.browsingOrgs = false;
            }
        },

        async browseDatasets() {
            this.browsingDatasets = true;
            this.browseDatasetsError = null;
            this.remoteDatasets = null;
            this.params.dataset = '';
            this.verifyResult = null;
            try {
                const res = await this.org.browseImport(this.sourceType, this.params, 'datasets');
                this.remoteDatasets = (res.items || []).map(d => ({
                    label: d.name ? `${d.name} (${d.slug})` : d.slug,
                    value: d.slug
                }));
                if (!this.remoteDatasets.length)
                    this.browseDatasetsError = 'No accessible datasets found in this organization.';
            } catch (e) {
                this.browseDatasetsError = e.message || 'Failed to load datasets.';
            } finally {
                this.browsingDatasets = false;
            }
        },

        async verify() {
            this.verifying = true;
            this.verifyError = null;
            this.verifyResult = null;
            try {
                const res = await this.org.verifyImport(this.sourceType, this.params);
                this.verifyResult = res;
                if (res.reachable) {
                    this.name = res.suggestedName || this.name || '';
                    this.slugEdited = false;
                    this.slug = this.uniqueSlug(res.suggestedSlug || slugFromName(this.name) || '');
                } else {
                    this.verifyError = res.note || 'The source is not reachable.';
                }
            } catch (e) {
                this.verifyError = e.message || 'Verification failed.';
            } finally {
                this.verifying = false;
            }
        },

        async startImport() {
            if (!this.canImport) return;
            this.submitting = true;
            let result;
            try {
                result = await this.org.createImport({
                    sourceType: this.sourceType,
                    params: this.params,
                    slug: this.slug,
                    name: this.name,
                    visibility: this.visibility
                });
            } catch (e) {
                this.submitting = false;
                this.verifyError = e.message || 'Could not start the import.';
                return;
            }

            this.submitting = false;
            this.importing = true;
            this.importStartTime = Date.now();
            this.taskId = result.taskId;

            // Tell the parent the dataset now exists so it can show it in the list.
            this.$emit('onClose', 'started', {
                slug: result.dsSlug || this.slug,
                name: this.name,
                visibility: this.visibility
            });

            const ds = this.org.Dataset(result.dsSlug || this.slug);
            try {
                await this.trackHeavyTask(ds, result.taskId, {
                    notify: false,
                    onProgress: this.onImportProgress
                });
                this.$emit('onClose', 'done', { slug: result.dsSlug || this.slug, success: true });
            } catch (e) {
                this.$emit('onClose', 'done', {
                    slug: result.dsSlug || this.slug,
                    success: false,
                    error: (e && e.message) || 'Import failed.'
                });
            }
        },

        onImportProgress(entry) {
            this.progressPercent = Math.round(entry.percent || 0);
            this.phase = entry.phase;
            this.logTail = entry.logTail || [];

            const p = entry.percent || 0;
            if (p > 1 && p < 100) {
                const elapsed = (Date.now() - this.importStartTime) / 1000;
                const total = elapsed / (p / 100);
                this.etaText = this.formatDuration(Math.max(0, total - elapsed));
            } else if (p >= 100) {
                this.etaText = '';
            }
        },

        formatDuration(seconds) {
            const s = Math.round(seconds);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
        },

        onWindowClose() {
            this.emitClose(this.importing ? 'background' : 'close');
        },

        emitClose(action) {
            this.$emit('onClose', action, { slug: this.slug });
        }
    }
};
</script>

<style scoped>
.import-dialog {
    min-width: 24rem;
}

.verify-stats {
    font-size: 0.95rem;
}

.verify-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
}

.verify-stat i {
    color: var(--p-primary-color, #2563eb);
}

.import-log {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--ddb-text-muted);
    background: var(--p-content-background, rgba(0, 0, 0, 0.03));
    border-radius: 4px;
    padding: 0.5rem;
    max-height: 8rem;
    overflow: auto;
}
</style>
