<template>
    <Window title="Share / Embed" id="share-embed" modal fixedSize @onClose="$emit('onClose')">
        <div class="content">
            <Message bindTo="error" noDismiss />
            <i v-if="loading" class="fa-solid fa-circle-notch fa-spin" />
            <div class="share-type" v-else>
                <label for="share-mode" class="me-2 fw-semibold">Share: </label>
                <Select id="share-mode" v-model="shareMode" :options="shareModeOptions" optionLabel="label" optionValue="value" style="min-width: 7.5rem;" />
            </div>

            <div v-if="shareMode === 'qgis'" class="mt-3">
                <template v-if="url !== ''">
                    <div class="ui icon positive message" v-if="!error">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        <div class="content">
                            <div class="header">
                                From QGIS
                            </div>
                            <div v-if="typeIs('POINTCLOUD')">
                                Layer <i class="fa-solid fa-arrow-right"></i> Add Point Cloud Layer <i
                                    class="fa-solid fa-arrow-right"></i> Source Type Protocol: HTTP(s) <i
                                    class="fa-solid fa-arrow-right"></i> copy/paste the URL below.
                            </div>
                            <div v-if="typeIs('GEORASTER')">
                                Layer <i class="fa-solid fa-arrow-right"></i> Add Raster Layer <i class="fa-solid fa-arrow-right"></i>
                                Source Type Protocol: HTTP(s) <i class="fa-solid fa-arrow-right"></i> copy/paste the URL below.
                            </div>
                            <div class="auth-note" v-if="needsAuth">
                                <i class="fa-solid fa-lock"></i> For Authentication choose Basic and use your username and
                                password.
                            </div>
                        </div>
                    </div>
                    <div class="share-url-row">
                        <InputText :modelValue="url" readonly @click="copyToClipboard" title="Copy to clipboard" style="flex: 1;" />
                        <Button @click="copyToClipboard" title="Copy to clipboard" :icon="copyIcon" text />
                    </div>
                </template>
                <template v-else>
                    <PrimeMessage severity="info" :closable="false">
                        <strong>Not supported</strong> — This file cannot be streamed directly into QGIS (download it instead).
                    </PrimeMessage>
                </template>
            </div>

            <div v-if="shareMode === 'link' || shareMode === 'tms' || shareMode === 'embed'" class="mt-3">
                <div v-if="needsAuth">
                    <Button severity="info" @click="handleSetUnlisted" icon="fa-solid fa-unlock" label="Allow access to anyone with the link" />
                </div>
                <div v-else>
                    <PrimeMessage v-if="!url" severity="info" :closable="false">
                        <strong>Not supported</strong> — This file does not support this type of sharing.
                    </PrimeMessage>
                    <template v-else>
                        <template v-if="shareMode === 'embed'">
                            <Textarea readonly :modelValue="url" @click="copyToClipboard" class="share-textarea" />
                        </template>
                        <template v-else>
                            <div class="share-url-row">
                                <InputText :modelValue="url" readonly @click="copyToClipboard" title="Copy to clipboard" style="flex: 1;" />
                                <Button @click="copyToClipboard" title="Copy to clipboard" :icon="copyIcon" text />
                            </div>
                        </template>
                    </template>
                </div>
            </div>

        </div>
    </Window>
</template>

<script>
import Window from './Window';
import Message from './Message';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Textarea from 'primevue/textarea';
import copy from 'clipboard-copy';
import ddb from 'ddb';

import { OpenItemDefaults } from '../libs/openItemDefaults';
import { b64encode } from '../libs/base64';

export default {
    components: {
        Window, Message, Button, Select, InputText, PrimeMessage, Textarea
    },
    props: ["file"],
    emits: ['onClose'],
    data: function () {
        return {
            copyIcon: "fa-regular fa-copy",
            loading: true,
            error: "",
            needsAuth: false,
            buildUrl: null,
            shareMode: "link",
            entry: null,
            dataset: null,
            shareModeOptions: [
                { label: "Link", value: "link" },
                { label: "Embed", value: "embed" },
                { label: "TMS", value: "tms" },
                { label: "QGIS", value: "qgis" }
            ]
        };
    },
    mounted: async function () {
        try {
            const [dataset, _] = ddb.utils.datasetPathFromUri(this.file.path);
            this.needsAuth = (await dataset.getVisibility()) === ddb.Visibility.PRIVATE;
            const entry = dataset.Entry(this.file.entry);

            if (entry.type === ddb.entry.type.POINTCLOUD) this.buildUrl = await entry.getEpt();
            else if (entry.type === ddb.entry.type.GEORASTER) this.buildUrl = await entry.getCog();
            else if (entry.type === ddb.entry.type.VECTOR) this.buildUrl = await entry.getVector();

            this.entry = entry;
            this.dataset = dataset;
        } catch (e) {
            this.error = e.message;
        }
        this.loading = false;
    },
    methods: {
        copyToClipboard: function (n) {
            copy(this.url);
            this.copyIcon = "fa-solid fa-check";
            this.copyTextTimeout = setTimeout(() => {
                this.copyIcon = "fa-regular fa-copy";
                this.copyTextTimeout = null;
            }, 2000);
        },
        handleSetUnlisted: async function () {
            try {
                this.loading = true;
                await this.dataset.setVisibility(ddb.Visibility.UNLISTED);
                this.needsAuth = false;
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },
        typeIs: function (t) {
            return this.file.entry.type === ddb.entry.type[t];
        }
    },

    computed: {
        url: function () {
            let baseUrl = `${window.location.protocol}//${window.location.host}`;

            if (this.shareMode === 'qgis' && this.buildUrl) {
                return `${baseUrl}${this.buildUrl}`;
            } else if (['link', 'embed'].indexOf(this.shareMode) !== -1 && this.entry) {
                let view = OpenItemDefaults[this.entry.type];
                if (view) {
                    let url = `${baseUrl}/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(this.entry.path)}/${view}`;
                    if (this.shareMode === 'embed') {
                        url += '?embed=1';
                        // Not really a URL...
                        url = `<iframe frameborder="0" width="600" height="400" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="fullscreen" src="${url}"></iframe>`;
                    }
                    return url;
                } else if (this.shareMode === 'link') {
                    return baseUrl + this.dataset.downloadUrl(this.entry.path, { inline: true });
                } else {
                    return '';
                }
            } else if (this.shareMode === 'tms' && this.entry) {
                if ([ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.GEOIMAGE].indexOf(this.entry.type) !== -1) {
                    return baseUrl + this.dataset.tileUrl(this.entry.path, "{z}", "{x}", "{y}");
                } else {
                    return '';
                }
            } else {
                return '';
            }
        }
    }
}
</script>

<style scoped>
.share-type {
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
}

label {
    font-weight: bold;
}

.content {
    min-width: 26.25rem;
}

.auth-note {
    margin-top: 0.5rem;
}

.share-url-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
}

.share-textarea {
    width: 100%;
    min-height: 5rem;
    font-family: monospace;
    font-size: 0.85em;
    margin-top: 0.5rem;
    resize: vertical;
}
</style>