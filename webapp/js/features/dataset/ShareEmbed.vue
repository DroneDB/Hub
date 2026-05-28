<template>
    <Window :title="windowTitle" id="share-embed" modal fixedSize @onClose="$emit('onClose')">
        <div class="content">
            <Message bindTo="error" noDismiss />
            <i v-if="loading" class="fa-solid fa-circle-notch fa-spin" />
            <template v-else>
                <div class="share-type">
                    <label for="share-mode" class="me-2 fw-semibold">Share: </label>
                    <Select id="share-mode" v-model="shareMode" :options="shareModeGroups"
                        optionLabel="label" optionValue="value"
                        optionGroupLabel="label" optionGroupChildren="items"
                        style="min-width: 9rem;" />
                    <Button v-if="hintsService" @click="hintsOpen = true" severity="secondary" text
                        icon="fa-solid fa-circle-question" title="How to use this service" class="ms-1" />
                </div>

                <!-- QGIS (legacy single-entry mode) -->
                <div v-if="shareMode === 'qgis'" class="mt-3">
                    <template v-if="qgisUrl">
                        <div class="ui icon positive message" v-if="!error">
                            <i class="fa-solid fa-cloud-arrow-up"></i>
                            <div class="content">
                                <div class="header">From QGIS</div>
                                <div v-if="typeIs('POINTCLOUD')">
                                    Layer <i class="fa-solid fa-arrow-right"></i> Add Point Cloud Layer <i
                                        class="fa-solid fa-arrow-right"></i> Source Type Protocol: HTTP(s) <i
                                        class="fa-solid fa-arrow-right"></i> copy/paste the URL below.
                                </div>
                                <div v-if="typeIs('GEORASTER')">
                                    Layer <i class="fa-solid fa-arrow-right"></i> Add Raster Layer <i
                                        class="fa-solid fa-arrow-right"></i> Source Type Protocol: HTTP(s) <i
                                        class="fa-solid fa-arrow-right"></i> copy/paste the URL below.
                                </div>
                                <div class="auth-note" v-if="needsAuth">
                                    <i class="fa-solid fa-lock"></i> For Authentication choose Basic and use your username and password.
                                </div>
                            </div>
                        </div>
                        <UrlRow :value="qgisUrl" @copy="copyToClipboard(qgisUrl)" :copyIcon="copyIcon" />
                    </template>
                    <PrimeMessage v-else severity="info" :closable="false">
                        <strong>Not supported</strong> - This file cannot be streamed directly into QGIS (download it instead).
                    </PrimeMessage>
                </div>

                <!-- Link / Embed / TMS (legacy single-entry modes) -->
                <div v-else-if="shareMode === 'link' || shareMode === 'tms' || shareMode === 'embed'" class="mt-3">
                    <div v-if="needsAuth">
                        <Button severity="info" @click="handleSetUnlisted" icon="fa-solid fa-unlock"
                            label="Allow access to anyone with the link" />
                    </div>
                    <template v-else>
                        <PrimeMessage v-if="!legacyUrl" severity="info" :closable="false">
                            <strong>Not supported</strong> - This file does not support this type of sharing.
                        </PrimeMessage>
                        <template v-else>
                            <Textarea v-if="shareMode === 'embed'" readonly :modelValue="legacyUrl"
                                @click="copyToClipboard(legacyUrl)" class="share-textarea" />
                            <UrlRow v-else :value="legacyUrl" @copy="copyToClipboard(legacyUrl)" :copyIcon="copyIcon" />
                        </template>
                    </template>
                </div>

                <!-- OGC modes (WMS/WMTS/WFS/WCS/OGC API) -->
                <div v-else-if="currentOgcService" class="mt-3">
                    <div v-if="needsAuth">
                        <Button severity="info" @click="handleSetUnlisted" icon="fa-solid fa-unlock"
                            label="Allow access to anyone with the link" />
                    </div>
                    <template v-else>
                        <PrimeMessage v-if="!ogcDescriptor || !ogcDescriptor.supported" severity="info"
                            :closable="false">
                            <strong>Not supported</strong>
                            <template v-if="ogcDescriptor && ogcDescriptor.reason"> - {{ ogcDescriptor.reason }}</template>
                        </PrimeMessage>
                        <template v-else>
                            <div v-for="row in ogcRows" :key="row.label">
                                <div class="ogc-row-label">{{ row.label }}</div>
                                <UrlRow :value="row.url" @copy="copyToClipboard(row.url)" :copyIcon="copyIcon" />
                            </div>
                        </template>
                    </template>
                </div>
            </template>

            <div class="d-flex justify-content-end mt-3">
                <Button @click="$emit('onClose')" severity="secondary" label="Close" />
            </div>
        </div>

        <OgcUsageHints v-if="hintsOpen && hintsService" :service="hintsService"
            :url="primaryHintUrl" @onClose="hintsOpen = false" />
    </Window>
</template>

<script>
import Window from '@/components/Window';
import Message from '@/components/Message';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Textarea from 'primevue/textarea';
import copy from 'clipboard-copy';
import ddb from 'ddb';

import { OpenItemDefaults } from '@/libs/openItemDefaults';
import { b64encode } from '@/libs/base64';
import { buildOgcShareUrls, OGC_SHARE_MODES } from '@/libs/ogcShareUrls';
import OgcUsageHints from './OgcUsageHints.vue';

// Inline URL+copy row component (kept private to ShareEmbed — DRY for legacy & OGC rows).
const UrlRow = {
    components: { InputText, Button },
    props: ['value', 'copyIcon'],
    emits: ['copy'],
    template: `
        <div class="share-url-row">
            <InputText :modelValue="value" readonly @click="$emit('copy')" title="Copy to clipboard" style="flex: 1;" />
            <Button @click="$emit('copy')" title="Copy to clipboard" :icon="copyIcon" text />
        </div>
    `
};

const LEGACY_MODES = [
    { value: 'link',  label: 'Link' },
    { value: 'embed', label: 'Embed' },
    { value: 'tms',   label: 'TMS (Tile Map Service)' },
    { value: 'qgis',  label: 'QGIS' }
];

export default {
    components: {
        Window, Message, Button, Select, InputText, PrimeMessage, Textarea, OgcUsageHints, UrlRow
    },
    props: {
        // Legacy: a file-like object { path, entry }. For dataset-level sharing pass
        // { path: <ddb dataset URI>, entry: null, scope: 'dataset' }.
        // For folder-level sharing, pass the directory entry as usual — scope is auto-detected.
        file: { type: Object, required: true }
    },
    emits: ['onClose'],
    data() {
        return {
            copyIcon: "fa-regular fa-copy",
            loading: true,
            error: "",
            needsAuth: false,
            buildUrl: null,
            shareMode: null,
            entry: null,
            dataset: null,
            hintsOpen: false
        };
    },
    computed: {
        scope() {
            if (this.file && this.file.scope) return this.file.scope;
            if (!this.file || !this.file.entry) return 'dataset';
            if (ddb.entry.isDirectory(this.file.entry)) return 'folder';
            return 'entry';
        },
        windowTitle() {
            if (this.scope === 'dataset') return 'Share Dataset';
            if (this.scope === 'folder')  return 'Share Folder';
            return 'Share / Embed';
        },
        baseUrl() {
            return `${window.location.protocol}//${window.location.host}`;
        },
        org() { return this.$route.params.org; },
        ds()  { return this.$route.params.ds;  },
        folderPath() {
            return this.scope === 'folder' && this.file.entry ? this.file.entry.path : null;
        },
        ogcUrls() {
            if (!this.dataset) return null;
            return buildOgcShareUrls({
                baseUrl: this.baseUrl,
                org: this.org,
                ds: this.ds,
                scope: this.scope,
                folderPath: this.folderPath,
                entry: this.entry
            });
        },
        shareModeGroups() {
            const groups = [];
            // Legacy modes only make sense on a single entry.
            if (this.scope === 'entry') {
                groups.push({ label: 'Standard', items: LEGACY_MODES });
            }
            const ogcItems = OGC_SHARE_MODES
                .filter(m => this.ogcUrls && this.ogcUrls[m.service]
                    && (this.ogcUrls[m.service].supported || this.scope === 'entry'))
                .map(m => ({
                    value: m.value,
                    label: this.ogcUrls[m.service].supported ? m.label : `${m.label} (n/a)`
                }));
            if (ogcItems.length) groups.push({ label: 'OGC services', items: ogcItems });
            return groups;
        },
        currentOgcService() {
            const m = OGC_SHARE_MODES.find(x => x.value === this.shareMode);
            return m ? m.service : null;
        },
        ogcDescriptor() {
            if (!this.currentOgcService || !this.ogcUrls) return null;
            return this.ogcUrls[this.currentOgcService];
        },
        ogcRows() {
            const d = this.ogcDescriptor;
            if (!d || !d.supported) return [];
            const rows = [];
            if (d.capabilities)     rows.push({ label: 'GetCapabilities URL',     url: d.capabilities });
            if (d.landing)          rows.push({ label: 'Landing page',            url: d.landing });
            if (d.collections)      rows.push({ label: 'Collections',             url: d.collections });
            if (d.items)            rows.push({ label: 'Items (sample)',          url: d.items });
            if (d.tilesets)         rows.push({ label: 'Tile sets',               url: d.tilesets });
            if (d.restTileTemplate) rows.push({ label: 'RESTful tile template',   url: d.restTileTemplate });
            if (d.getMap)           rows.push({ label: 'GetMap (sample)',         url: d.getMap });
            if (d.getFeature)       rows.push({ label: 'GetFeature (sample)',     url: d.getFeature });
            if (d.getCoverage)      rows.push({ label: 'GetCoverage (sample)',    url: d.getCoverage });
            return rows;
        },
        primaryHintUrl() {
            return this.ogcRows.length ? this.ogcRows[0].url : '';
        },
        hintsService() {
            return this.currentOgcService;
        },
        legacyUrl() {
            if (this.scope !== 'entry' || !this.entry) return '';
            const baseUrl = this.baseUrl;
            if (this.shareMode === 'link' || this.shareMode === 'embed') {
                const view = OpenItemDefaults[this.entry.type];
                if (view) {
                    let url = `${baseUrl}/r/${this.org}/${this.ds}/view/${b64encode(this.entry.path)}/${view}`;
                    if (this.shareMode === 'embed') {
                        url += '?embed=1';
                        url = `<iframe frameborder="0" width="600" height="400" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="fullscreen" src="${url}"></iframe>`;
                    }
                    return url;
                }
                if (this.shareMode === 'link') {
                    return baseUrl + this.dataset.downloadUrl(this.entry.path, { inline: true });
                }
                return '';
            }
            if (this.shareMode === 'tms') {
                if ([ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.GEOIMAGE]
                    .indexOf(this.entry.type) !== -1) {
                    return baseUrl + this.dataset.tileUrl(this.entry.path, "{z}", "{x}", "{y}");
                }
            }
            return '';
        },
        qgisUrl() {
            if (this.scope !== 'entry' || this.shareMode !== 'qgis' || !this.buildUrl) return '';
            return this.baseUrl + this.buildUrl;
        }
    },
    async mounted() {
        try {
            const [dataset] = ddb.utils.datasetPathFromUri(this.file.path);
            this.dataset = dataset;
            this.needsAuth = (await dataset.getVisibility()) === ddb.Visibility.PRIVATE;

            if (this.scope === 'entry' && this.file.entry) {
                const entry = dataset.Entry(this.file.entry);
                this.entry = entry;
                if (entry.type === ddb.entry.type.POINTCLOUD)     this.buildUrl = await entry.getCopc();
                else if (entry.type === ddb.entry.type.GEORASTER) this.buildUrl = await entry.getCog();
                else if (entry.type === ddb.entry.type.VECTOR)    this.buildUrl = await entry.getVector();
            }

            this.shareMode = this.pickDefaultMode();
        } catch (e) {
            this.error = e.message;
        }
        this.loading = false;
    },
    methods: {
        pickDefaultMode() {
            if (this.scope === 'entry') return 'link';
            const groups = this.shareModeGroups;
            if (groups.length && groups[0].items.length) return groups[0].items[0].value;
            return null;
        },
        copyToClipboard(value) {
            if (!value) return;
            copy(value);
            this.copyIcon = "fa-solid fa-check";
            if (this._copyTimeout) clearTimeout(this._copyTimeout);
            this._copyTimeout = setTimeout(() => {
                this.copyIcon = "fa-regular fa-copy";
                this._copyTimeout = null;
            }, 2000);
        },
        async handleSetUnlisted() {
            try {
                this.loading = true;
                await this.dataset.setVisibility(ddb.Visibility.UNLISTED);
                this.needsAuth = false;
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },
        typeIs(t) {
            return this.entry && this.entry.type === ddb.entry.type[t];
        }
    }
};
</script>

<style scoped>
.share-type { margin-bottom: 0.75rem; display: flex; align-items: center; }
label { font-weight: bold; }
.content { min-width: 26.25rem; }
.auth-note { margin-top: 0.5rem; }
.share-url-row { display: flex; align-items: center; gap: 0.25rem; margin-top: 0.5rem; }
.share-textarea {
    width: 100%;
    min-height: 5rem;
    font-family: monospace;
    font-size: var(--ddb-font-size-sm);
    margin-top: 0.5rem;
    resize: vertical;
}
.ogc-row-label {
    margin-top: 0.75rem;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
    font-weight: 600;
}
</style>
