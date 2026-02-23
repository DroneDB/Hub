<template>
    <Window title="Settings" id="settings" @onClose="close('close')" modal maxWidth="70%" fixedSize fixedPosition
        closeModalOnClick>
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div class="settings-body" v-else>
            <div class="settings-section">
                <h4 class="ui header">
                    <i class="icon" :class="{ unlock: noAuthRequired, lock: !noAuthRequired }"></i>
                    <div class="content">
                        Visibility: <select v-model="visibility" @change="setVisibility">
                            <option v-for="(v, k) in Visibilities" :value="k">{{ v.label }}</option>
                        </select>
                    </div>
                </h4>
                <div class="settings-desc" v-html="description"></div>
            </div>

            <div class="settings-section">
                <h4 class="ui header">
                    <i class="icon balance scale"></i>
                    <div class="content">
                        License: <select style="text-overflow: ellipsis" :title="Licenses[license].name"
                            class="license-dropdown" v-model="license" @change="setLicense">
                            <option v-for="(v, k) in Licenses" :value="k">{{ v.name }}</option>
                        </select>
                    </div>
                </h4>
            </div>

            <div class="settings-section" v-if="readme == null">
                <button @click="addDocument('README.md')" class="ui button basic icon">
                    <i class="icon book" /> Add Readme
                </button>
            </div>

            <div class="settings-section settings-maintenance" v-if="canWrite">
                <h4 class="ui header">
                    <i class="icon cog"></i>
                    <div class="content">Maintenance</div>
                </h4>
                <div class="rescan-info-box">
                    <i class="icon info circle"></i>
                    <div>
                        <strong>Rescan</strong> re-processes all indexed files to update their metadata
                        (e.g. GPS coordinates, timestamps, thumbnails). This is useful after a DroneDB upgrade
                        or if file metadata appears outdated or incorrect.
                    </div>
                </div>
                <button @click="$emit('rescanRequested')" class="ui button basic icon">
                    <i class="icon sync" /> Rescan Dataset
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Message from './Message.vue';
import mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import { Licenses } from '../libs/licenses';
import Window from './Window.vue';
import ddb from 'ddb';

export default {
    props: {
        dataset: {
            required: true,
            type: Object
        },
        canWrite: {
            type: Boolean,
            default: false
        }
    },
    components: {
        Message, Window
    },
    data: function () {
        return {
            error: "",
            properties: null,
            loading: true,
            readme: null,
            license: "proprietary",
            Licenses,
            Visibilities: {
                [ddb.Visibility.PUBLIC]: { label: "Public" },
                [ddb.Visibility.UNLISTED]: { label: "Unlisted" },
                [ddb.Visibility.PRIVATE]: { label: "Private" }
            },
            visibility: ddb.Visibility.PRIVATE
        }
    },
    mounted: async function () {
        try {
            const info = await this.dataset.info();
            this.properties = info[0].properties;

            this.readme = (typeof this.properties.readme !== 'undefined') ? this.properties.readme : null;
            this.license = this.properties?.meta?.license?.data ?? 'proprietary';
            this.visibility = this.properties?.meta?.visibility?.data ?? ddb.Visibility.PRIVATE;

            console.log(this.Visibilities);
        } catch (e) {
            this.error = e.message;
        }

        this.loading = false;
    },
    beforeDestroy: function () {
    },
    computed: {
        currentUrl: function () {
            return window.location.href;
        },
        noAuthRequired: function () {
            return [ddb.Visibility.PUBLIC, ddb.Visibility.UNLISTED].indexOf(this.visibility) !== -1;
        },
        description: function () {
            if (parseInt(this.visibility) === ddb.Visibility.PUBLIC) {
                return `This dataset will be discoverable. Anybody with the <a href="${this.currentUrl}">link</a> to this page can also see and download the data`;
            } else if (parseInt(this.visibility) === ddb.Visibility.UNLISTED) {
                return `Anybody with the <a href="${this.currentUrl}">link</a> to this page can see and download the data, but it will not be discoverable.`;
            } else {
                return `Only you and people in your organization can see and download the data.`;
            }
        }
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },
        setVisibility: async function () {
            try {
                this.properties.meta.visibility = await this.dataset.setVisibility(this.visibility);
            } catch (e) {
                this.error = e.message;
            }
        },
        setLicense: async function () {
            try {
                this.properties.meta.license = await this.dataset.metaSet("license", this.license);
            } catch (e) {
                this.error = e.message;
            }
        },
        addDocument: async function (document) {

            this.loading = true;

            var entry = null;

            switch (document) {
                // case "LICENSE.md":
                //     entry = await this.dataset.writeObj(document, "# License\n");
                //     this.license = document;
                //     break;
                case "README.md":
                    entry = await this.dataset.writeObj(document, "\n");
                    this.readme = document;
                    break;
                default:
                    throw new Error("Invalid document: " + document);
            }

            this.$emit('addMarkdown', document, entry);

            this.loading = false;
        }
    }
}
</script>

<style scoped>
#settings {
    min-height: 200px;
    padding: 16px;
    margin-top: 12px;
}

.loading {
    text-align: center;
    padding: 16px;
}

.settings-body {
    padding: 4px 8px 0 8px;
}

.settings-section {
    padding: 12px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.settings-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.settings-section .ui.header {
    margin-top: 0;
    margin-bottom: 6px;
}

.settings-desc {
    font-size: 90%;
    margin-top: 4px;
    max-width: 420px;
    color: #555;
}

.settings-desc a {
    text-decoration: underline;
}

.settings-section .ui.button {
    color: #030A03 !important;
}

.license-dropdown {
    max-width: 250px;
}

.rescan-info-box {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
    background-color: rgba(33, 133, 208, 0.08);
    border: 1px solid rgba(33, 133, 208, 0.2);
    border-radius: 4px;
    font-size: 90%;
    color: #444;
    line-height: 1.4;
}

.rescan-info-box > .icon {
    color: #2185d0;
    flex-shrink: 0;
    margin-top: 2px;
}
</style>
