<template>
    <Window id="importDatasetDialog" :title="title" modal size-class="dialog-xl" fixed-size @close="onWindowClose">
        <div>
            <!-- Configure + verify -->
            <div v-if="!importing">
                <div class="mb-3">
                    <label id="import-dataset-dialog-source-label" for="import-dataset-dialog-source" class="d-block mb-1 fw-semibold">Source</label>
                    <Select v-model="sourceType" input-id="import-dataset-dialog-source" aria-labelledby="import-dataset-dialog-source-label" :options="sourceOptions" option-label="label" option-value="type"
                            class="w-100" :disabled="verifying" placeholder="Select a source" @change="onSourceChange" />
                    <small v-if="selectedSource" class="text-muted">{{ selectedSource.description }}</small>
                </div>

                <!-- Registry source: enhanced UI with org/dataset browsing -->
                <template v-if="sourceType === 'registry' && selectedSource">
                    <div class="mb-3">
                        <label for="import-dataset-dialog-registry-url" class="d-block mb-1 fw-semibold">Registry URL <span class="text-danger">*</span></label>
                        <InputText id="import-dataset-dialog-registry-url" v-model="params.url" :placeholder="registryPlaceholder" class="w-100"
                                   :disabled="verifying" :aria-describedby="registryHint ? 'import-dataset-dialog-registry-hint' : undefined"
                                   @input="onRemoteUrlChange" @paste="onRemoteUrlPaste" @change="applyRegistryLink"
                                   @keyup.enter="applyRegistryLink(); canVerify && verify()" />
                        <small v-if="registryHint" id="import-dataset-dialog-registry-hint" class="d-block text-danger" role="status">{{ registryHint }}</small>
                        <small class="text-muted">The address of the registry, or paste the link of a dataset ({{ exampleLink }}) to fill in every field.</small>
                    </div>
                    <!-- Most registries are public: the credentials stay folded until they are needed. They open when a
                         Verify fails, and stay open while they hold a value: nothing is sent that the user cannot see -->
                    <div class="mb-3">
                        <button type="button" class="btn-reset import-credentials-toggle" :aria-expanded="credentialsOpen"
                                aria-controls="import-dataset-dialog-credentials" :disabled="hasCredentials"
                                :title="hasCredentials ? 'Clear the username and the password to fold the credentials' : undefined"
                                @click="showCredentials = !showCredentials">
                            <i :class="credentialsOpen ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" aria-hidden="true" />
                            Credentials (optional)
                        </button>
                        <div v-show="credentialsOpen" id="import-dataset-dialog-credentials" class="row g-2 mt-1">
                            <div class="col-sm">
                                <label for="import-dataset-dialog-username" class="d-block mb-1 fw-semibold">Username</label>
                                <InputText id="import-dataset-dialog-username" v-model="params.username" placeholder="optional" class="w-100"
                                           :disabled="verifying" @keyup.enter="canVerify && verify()" />
                            </div>
                            <div class="col-sm">
                                <label for="import-dataset-dialog-password" class="d-block mb-1 fw-semibold">Password</label>
                                <InputText id="import-dataset-dialog-password" v-model="params.password" type="password" placeholder="optional" class="w-100"
                                           :disabled="verifying" @keyup.enter="canVerify && verify()" />
                            </div>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label id="import-dataset-dialog-organization-label" for="import-dataset-dialog-organization" class="d-block mb-1 fw-semibold">Organization <span class="text-danger">*</span></label>
                        <div class="d-flex gap-2">
                            <Select v-if="remoteOrgs !== null" v-model="params.organization" input-id="import-dataset-dialog-organization" aria-labelledby="import-dataset-dialog-organization-label"
                                    :options="remoteOrgs" option-label="label" option-value="value"
                                    filter :filter-fields="['label', 'value']" filter-placeholder="Search organizations"
                                    :pt="{ pcFilter: { root: { 'aria-label': 'Search organizations' } } }"
                                    placeholder="Select an organization" class="flex-grow-1" style="min-width: 0"
                                    :disabled="verifying || browsingOrgs" @change="onRemoteOrgChange" />
                            <InputText v-else v-model="params.organization" placeholder="organization slug" aria-label="Organization slug"
                                       class="flex-grow-1" :disabled="verifying || browsingOrgs"
                                       @keyup.enter="canVerify && verify()" />
                            <Button icon="fa-solid fa-list" severity="secondary" :loading="browsingOrgs"
                                    :disabled="!canBrowseOrgs || browsingOrgs" title="Browse organizations" aria-label="Browse organizations"
                                    @click="browseOrgs" />
                        </div>
                        <small v-if="browseOrgsError" class="text-danger">{{ browseOrgsError }}</small>
                    </div>
                    <div class="mb-3">
                        <label id="import-dataset-dialog-dataset-label" for="import-dataset-dialog-dataset" class="d-block mb-1 fw-semibold">Dataset <span class="text-danger">*</span></label>
                        <div class="d-flex gap-2">
                            <Select v-if="remoteDatasets !== null" v-model="params.dataset" input-id="import-dataset-dialog-dataset" aria-labelledby="import-dataset-dialog-dataset-label"
                                    :options="remoteDatasets" option-label="label" option-value="value"
                                    filter :filter-fields="['label', 'value']" filter-placeholder="Search datasets"
                                    :pt="{ pcFilter: { root: { 'aria-label': 'Search datasets' } } }"
                                    placeholder="Select a dataset" class="flex-grow-1" style="min-width: 0"
                                    :disabled="verifying || browsingDatasets" />
                            <InputText v-else v-model="params.dataset" placeholder="dataset slug" aria-label="Dataset slug"
                                       class="flex-grow-1" :disabled="verifying || browsingDatasets"
                                       @keyup.enter="canVerify && verify()" />
                            <Button icon="fa-solid fa-list" severity="secondary" :loading="browsingDatasets"
                                    :disabled="!canBrowseDatasets || browsingDatasets" title="Browse datasets" aria-label="Browse datasets"
                                    @click="browseDatasets" />
                        </div>
                        <small v-if="browseDatasetsError" class="text-danger">{{ browseDatasetsError }}</small>
                    </div>
                </template>

                <!-- Generic fields for all other source types -->
                <template v-else>
                    <div v-for="f in selectedSource ? selectedSource.fields : []" :key="f.name" class="mb-3">
                        <label :for="'import-dataset-field-' + f.name" class="d-block mb-1 fw-semibold">
                            {{ f.label }}<span v-if="f.required" class="text-danger"> *</span>
                        </label>
                        <InputText :id="'import-dataset-field-' + f.name" v-model="params[f.name]" :type="f.type === 'password' ? 'password' : 'text'"
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

                <div v-if="verifyResult && verifyResult.reachable" ref="verifyPanel" class="verify-result mt-3">
                    <PrimeMessage severity="success" :closable="false">Source reachable</PrimeMessage>

                    <div class="verify-stats mt-2 d-flex flex-wrap gap-3">
                        <span v-if="verifyResult.fileCount != null" class="verify-stat">
                            <i class="fa-solid fa-file" />
                            {{ verifyResult.fileCount }} file{{ verifyResult.fileCount === 1 ? '' : 's' }}
                        </span>
                        <span v-if="verifyResult.estimatedBytes != null" class="verify-stat">
                            <i class="fa-solid fa-database" /> {{ bytesToSize(verifyResult.estimatedBytes) }}
                        </span>
                    </div>
                    <div v-if="verifyResult.note" class="mt-1">
                        <small class="text-muted"><i class="fa-solid fa-circle-info" /> {{ verifyResult.note }}</small>
                    </div>

                    <div class="row g-3 mt-1">
                        <div class="col-md-6">
                            <label for="import-dataset-dialog-dataset-name" class="d-block mb-1 fw-semibold">Dataset Name</label>
                            <InputText id="import-dataset-dialog-dataset-name" ref="datasetName" v-model="name" placeholder="Dataset name" class="w-100" />
                        </div>
                        <div class="col-md-6">
                            <label id="import-dataset-dialog-visibility-label" for="import-dataset-dialog-visibility" class="d-block mb-1 fw-semibold">Visibility</label>
                            <Select v-model="visibility" input-id="import-dataset-dialog-visibility" aria-labelledby="import-dataset-dialog-visibility-label" :options="visibilityOptions" option-label="label"
                                    option-value="value" class="w-100" />
                        </div>
                    </div>
                    <div class="mb-2 mt-2">
                        <label for="import-dataset-dialog-slug" class="d-block mb-1 fw-semibold">Slug</label>
                        <InputText id="import-dataset-dialog-slug" v-model="slug" placeholder="dataset-slug" class="w-100" @input="slugEdited = true" />
                        <small v-if="slug && slugFormatInvalid" class="text-danger">
                            {{ slugFormatProblem }}
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

        </div>
        <!-- Outside the scrolling content: Import is in view after Verify (FR-UPL-08) -->
        <template #footer>
            <!-- The refusal of the Import, next to the button that was pressed (FR-UPL-19) -->
            <span v-if="importError && !importing" id="import-dataset-dialog-import-error" class="import-error flex-grow-1 align-self-center text-danger text-start" role="alert">{{ importError }}</span>
            <Button v-if="!importing" severity="secondary" label="Close" data-cancel @click="emitClose('close')" />
            <Button v-if="!importing" severity="primary" icon="fa-solid fa-download" :disabled="!canImport" data-confirm
                    :loading="submitting" label="Import" @click="startImport" />
            <Button v-if="importing" severity="secondary" label="Run in background" data-cancel
                    @click="emitClose('background')" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import { bytesToSize } from '@/libs/utils';
import reg from '@/libs/api/sharedRegistry';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY } from '@/libs/visibility';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { IMPORT_SOURCES, getImportSource, splitRegistryLink, needsRegistryAddress, REGISTRY_ADDRESS_HINT } from './importSources';
import { formatDurationSeconds } from '@/libs/format';
import { createEtaEstimator } from '@/libs/etaWindow';
import { DEFAULT_REGISTRY } from '@/libs/ddb/constants';
import { slugProblem, suggestSlug, uniqueNameAndSlug } from '@/libs/slug';

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
    components: {
        Window, Select, InputText, Button, PrimeMessage, ProgressBar
    },
    props: {
        orgSlug: { type: String, required: true },
        forbiddenSlugs: { type: Array, default: () => [] }
    },
    emits: ['close'],

    setup() {
        const { trackHeavyTask } = useHeavyTask();
        return { trackHeavyTask };
    },
    data() {
        return {
            title: 'Import dataset',
            org: null,
            sourceOptions: [],
            sourceType: null,
            params: {},

            verifying: false,
            // Username and password: folded until the user opens them, a Verify fails or they hold a value
            showCredentials: false,
            verifyResult: null,
            verifyError: null,
            // Why the Import was refused (the Registry's answer to the create), shown next to the Import button
            importError: null,

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
            visibility: DEFAULT_VISIBILITY,
            visibilityOptions: VISIBILITY_OPTIONS,

            submitting: false,
            importing: false,
            taskId: null,
            importStartTime: 0,
            progressPercent: 0,
            phase: null,
            logTail: [],
            etaText: '',
            // A name and a slug that Verify suggests are being set: the name watcher leaves the slug alone
            suggesting: false
        };
    },

    computed: {
        selectedSource() {
            return getImportSource(this.sourceType);
        },
        // A username or a password is sent: the user sees it
        hasCredentials() {
            return !!(this.params.username || this.params.password);
        },
        credentialsOpen() {
            return this.showCredentials || this.hasCredentials;
        },
        registryPlaceholder() {
            return `https://${DEFAULT_REGISTRY}`;
        },
        exampleLink() {
            return `https://${DEFAULT_REGISTRY}/r/odm/brighton-beach`;
        },
        // What the Registry URL field holds as a link: the registry, the organization and the dataset it names, or null.
        // Verify, Browse and the hints read it, so that a link that is typed (no change event yet) counts as it does once
        // it is applied (FR-UPL-20, FR-UPL-18)
        parsedLink() {
            return this.sourceType === 'registry' ? splitRegistryLink(this.params.url) : null;
        },
        // The field holds a '/' but no registry could be read from it (FR-UPL-18)
        registryHint() {
            return this.sourceType === 'registry' && needsRegistryAddress(this.params.url) ? REGISTRY_ADDRESS_HINT : '';
        },
        canBrowseOrgs() {
            return !!(this.params.url || '').trim();
        },
        canBrowseDatasets() {
            return !!(this.params.url || '').trim()
                && (!!(this.params.organization || '').trim() || !!this.parsedLink?.organization);
        },
        canVerify() {
            if (!this.selectedSource) return false;
            if (this.parsedLink?.organization && this.parsedLink.dataset) return true;
            return this.selectedSource.fields
                .filter(f => f.required)
                .every(f => (this.params[f.name] || '').trim().length > 0);
        },
        // The Registry's slug rule and its text (FR-XC-12)
        slugFormatProblem() {
            return slugProblem(this.slug, 'Dataset');
        },
        slugFormatInvalid() {
            return !!this.slugFormatProblem;
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
            // The name that Verify suggests comes with its slug (the remote slug, the same number): not made again from it
            if (this.suggesting) return;
            if (!this.slugEdited) this.slug = uniqueNameAndSlug(val, suggestSlug(val), this.forbiddenSlugs).slug;
        }
    },

    async mounted() {
        this.org = reg.Organization(this.orgSlug);

        let enabled;
        try {
            enabled = await this.org.importSources();
        } catch {
            // Fall back to the full catalog if the server does not expose the endpoint.
            enabled = IMPORT_SOURCES.map(s => s.type);
        }

        this.sourceOptions = IMPORT_SOURCES.filter(s => enabled.includes(s.type));
        if (this.sourceOptions.length) {
            this.sourceType = this.sourceOptions[0].type;
            this.onSourceChange();
        }
    },

    methods: {
        bytesToSize,

        onSourceChange() {
            // Reset the param object to just the fields of the selected source.
            const next = {};
            (this.selectedSource ? this.selectedSource.fields : []).forEach(f => { next[f.name] = ''; });
            this.params = next;
            this.resetVerify();
            this.importError = null;
            this.slugEdited = false;
            this._resetBrowseState();
        },

        // The verify state is about the values that were verified: when they change it goes with them (FR-UPL-17)
        resetVerify() {
            this.verifyError = null;
            this.verifyResult = null;
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
            this.resetVerify();
            this.importError = null;
        },

        // A link of a dataset (a page, the API or a ddb tag) in the URL field: the field keeps the address
        // of the registry and the organization and the dataset of the link fill their fields.
        // Returns true when the field held such a link.
        applyRegistryLink() {
            if (this.sourceType !== 'registry') return false;
            const link = splitRegistryLink(this.params.url);
            if (!link) return false;
            this._resetBrowseState();
            this.resetVerify();
            this.params.url = link.url;
            this.params.organization = link.organization;
            this.params.dataset = link.dataset;
            return true;
        },

        // A pasted link of a dataset fills every field and verifies the dataset at once.
        onRemoteUrlPaste(e) {
            const text = e.clipboardData ? e.clipboardData.getData('text') : '';
            if (!splitRegistryLink(text)) return;
            e.preventDefault();
            this.params.url = text;
            this.applyRegistryLink();
            if (this.params.dataset && this.canVerify) this.verify();
        },

        // Called when the user selects an org from the browse dropdown: reset dataset browse.
        onRemoteOrgChange() {
            this.remoteDatasets = null;
            this.browseDatasetsError = null;
            this.params.dataset = '';
            this.resetVerify();
        },

        async browseOrgs() {
            this.applyRegistryLink();
            this.browsingOrgs = true;
            this.browseOrgsError = null;
            this.remoteOrgs = null;
            this.remoteDatasets = null;
            this.params.organization = '';
            this.params.dataset = '';
            this.resetVerify();
            try {
                const res = await this.org.browseImport(this.sourceType, this.params, 'organizations');
                this.remoteOrgs = (res.items || [])
                    .map(o => ({
                        label: o.name ? `${o.name} (${o.slug})` : o.slug,
                        value: o.slug
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                if (!this.remoteOrgs.length)
                    this.browseOrgsError = 'No accessible organizations found.';
            } catch (e) {
                this.browseOrgsError = e.message || 'Failed to load organizations.';
            } finally {
                this.browsingOrgs = false;
            }
        },

        async browseDatasets() {
            this.applyRegistryLink();
            this.browsingDatasets = true;
            this.browseDatasetsError = null;
            this.remoteDatasets = null;
            this.params.dataset = '';
            this.resetVerify();
            try {
                const res = await this.org.browseImport(this.sourceType, this.params, 'datasets');
                this.remoteDatasets = (res.items || [])
                    .map(d => ({
                        label: d.name ? `${d.name} (${d.slug})` : d.slug,
                        value: d.slug
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                if (!this.remoteDatasets.length)
                    this.browseDatasetsError = 'No accessible datasets found in this organization.';
            } catch (e) {
                this.browseDatasetsError = e.message || 'Failed to load datasets.';
            } finally {
                this.browsingDatasets = false;
            }
        },

        async verify() {
            this.applyRegistryLink();
            this.verifying = true;
            this.resetVerify();
            this.importError = null;
            try {
                const res = await this.org.verifyImport(this.sourceType, this.params);
                this.verifyResult = res;
                if (res.reachable) {
                    // The remote display name and slug; a second import of the same dataset gets 'Name (2)' and 'slug-2'
                    // (FR-UPL-14)
                    const suggestedName = res.suggestedName || this.name || '';
                    const next = uniqueNameAndSlug(suggestedName, res.suggestedSlug || suggestSlug(suggestedName), this.forbiddenSlugs);
                    this.suggesting = true;
                    this.name = next.name;
                    this.slugEdited = false;
                    this.slug = next.slug;
                    this.$nextTick(() => { this.suggesting = false; });
                    this.showNextStep();
                } else {
                    this.verifyError = res.note || 'The source is not reachable.';
                    // A private source: the credentials may be what is missing
                    this.showCredentials = true;
                }
            } catch (e) {
                this.verifyError = e.message || 'Verification failed.';
                this.showCredentials = true;
            } finally {
                this.verifying = false;
            }
        },

        // After a reachable Verify the next step (name, slug, Import) is brought into view and the name takes the focus
        showNextStep() {
            this.$nextTick(() => {
                const panel = this.$refs.verifyPanel;
                if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'nearest' });
                this.$refs.datasetName?.$el?.focus?.({ preventScroll: true });
            });
        },

        async startImport() {
            if (!this.canImport) return;
            this.submitting = true;
            this.importError = null;
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
                // The refusal is about the Import, not about the source: 'Source reachable' goes, the reason shows next to
                // the button (FR-UPL-19, FR-UPL-17)
                this.resetVerify();
                this.importError = e.message || 'Could not start the import.';
                return;
            }

            this.submitting = false;
            this.importing = true;
            this.importStartTime = Date.now();
            this._eta = createEtaEstimator();
            this._eta.add(this.importStartTime, 0);
            this.taskId = result.taskId;

            // Tell the parent the dataset now exists so it can show it in the list.
            this.$emit('close', 'started', {
                slug: result.dsSlug || this.slug,
                taskId: result.taskId,
                name: this.name,
                visibility: this.visibility
            });

            const ds = this.org.Dataset(result.dsSlug || this.slug);
            try {
                await this.trackHeavyTask(ds, result.taskId, {
                    notify: false,
                    onProgress: this.onImportProgress
                });
                this.$emit('close', 'done', { slug: result.dsSlug || this.slug, success: true });
            } catch (e) {
                this.$emit('close', 'done', {
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

            // The time left from the speed of the last 30 seconds (FR-UPL-21), not the average since the start
            const p = entry.percent || 0;
            if (!this._eta) {
                this._eta = createEtaEstimator();
                this._eta.add(this.importStartTime || Date.now(), 0);
            }
            const seconds = this._eta.add(Date.now(), p);
            this.etaText = p >= 100 || seconds == null ? '' : formatDurationSeconds(Math.round(Math.max(0, seconds)));
        },

        onWindowClose() {
            this.emitClose(this.importing ? 'background' : 'close');
        },

        emitClose(action) {
            this.$emit('close', action, { slug: this.slug });
        }
    }
};
</script>

<style scoped>
.import-credentials-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: 600;
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
    color: var(--p-primary-color);
}

.import-log {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--ddb-text-muted);
    background: var(--p-content-background);
    border-radius: 4px;
    padding: 0.5rem;
    max-height: 8rem;
    overflow: auto;
}
</style>
