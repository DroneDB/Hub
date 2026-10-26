<template>
    <div class="props-table-wrapper">
        <!-- Array at root level: render each item as a sub-table -->
        <div v-if="Array.isArray(tObj)" class="props-array-list">
            <div v-for="(item, index) in tObj" :key="index">
                <PropsTable :obj="item" :depth="depth" :max-depth="maxDepth" />
            </div>
        </div>

        <!-- Object: render as DataTable -->
        <DataTable v-else-if="tObj !== null && typeof tObj === 'object'"
                   :value="rows"
                   size="small"
                   class="props-datatable">
            <Column field="displayKey" header="Property" style="width: 40%;" />
            <Column header="Value">
                <template #body="{ data }">
                    <div v-if="data.key === 'captureTime' && data.rawValue">
                        {{ new Date(data.rawValue) }}
                    </div>
                    <div v-else-if="data.key === 'bands' && Array.isArray(data.rawValue)">
                        {{ data.rawValue.map(b => b && b.colorInterp ? b.colorInterp : '').join(', ') }}
                    </div>
                    <div v-else-if="data.key === 'dimensions' && Array.isArray(data.rawValue)">
                        {{ data.rawValue.join(', ') }}
                    </div>
                    <div v-else-if="typeof data.rawValue === 'boolean' && data.rawValue" class="bool-true" title="true">✓</div>
                    <div v-else-if="typeof data.rawValue === 'boolean'" class="bool-false" title="false">✗</div>
                    <div v-else-if="isEntryTypeRow(data)" class="copyable-row">
                        <span>{{ data.rawValue }}</span>
                        <Button icon="fa-regular fa-circle-question"
                                size="small"
                                text
                                class="row-action-btn type-info-btn"
                                :title="`What is ${data.rawValue}?`"
                                :aria-label="`What is ${data.rawValue}?`"
                                @click="typeInfoVisible = true" />
                    </div>
                    <div v-else-if="data.rawValue !== null && typeof data.rawValue === 'string'" class="wrap copyable-row">
                        <a v-if="isUrl(data.rawValue)" :href="data.rawValue" target="_blank" rel="noopener noreferrer">{{ data.rawValue }}</a>
                        <span v-else>
                            <template v-for="(part, i) in linkCrsCodes(data.rawValue)" :key="i">
                                <a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" class="text-nowrap"
                                   :title="`What is ${part.text}? (epsg.io)`">{{ part.text }}</a>
                                <template v-else>{{ part.text }}</template>
                            </template>
                        </span>
                        <Button v-if="copyableValues[data.key]"
                                icon="fa-regular fa-copy"
                                size="small"
                                text
                                class="row-action-btn"
                                :title="`Copy ${copyableValues[data.key].label} to clipboard`"
                                :aria-label="`Copy ${copyableValues[data.key].label} to clipboard`"
                                @click="copyValue(copyableValues[data.key])" />
                    </div>
                    <div v-else-if="typeof data.rawValue === 'number'">
                        {{ data.rawValue.toLocaleString() }}
                    </div>
                    <!-- Object/array beyond max depth: show drill-down button -->
                    <Button v-else-if="shouldCollapse(data.rawValue)"
                            :label="collapsedLabel(data.rawValue)"
                            icon="fa-solid fa-arrow-up-right-from-square"
                            size="small"
                            severity="secondary"
                            style="cursor: pointer"
                            @click="openDrillDown(data.displayKey, data.rawValue)" />
                    <PropsTable v-else-if="data.rawValue !== null && data.rawValue !== undefined"
                                :obj="data.rawValue"
                                :depth="depth + 1"
                                :max-depth="maxDepth" />
                    <span v-else>-</span>
                    <small v-if="rowNotes[data.key]" class="row-note">{{ rowNotes[data.key] }}</small>
                </template>
            </Column>
        </DataTable>

        <!-- Scalar number -->
        <div v-else-if="typeof tObj === 'number'">
            {{ tObj.toLocaleString() }}
        </div>

        <!-- Scalar string / other -->
        <div v-else>
            {{ tObj !== undefined && tObj !== null ? tObj : '-' }}
        </div>

        <EntryTypeInfoDialog v-if="typeInfoVisible" :type="Number(entryType)" @close="typeInfoVisible = false" />

        <!-- Drill-down dialog: only mounted from the top-level instance to avoid stacking -->
        <Window v-if="depth === 0"
                v-model:visible="drillDownVisible"
                :title="drillDownTitle"
                modal
                close-modal-on-click
                width="75vw" max-width="1100px" height="auto">
            <PropsTable v-if="drillDownVisible"
                        :obj="drillDownData"
                        :depth="0"
                        :max-depth="Infinity"
                        :preserve-order="preserveOrder" />
        </Window>
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '@/libs/utils';
import { tidyProperties, beautifyKey, isUrl, linkCrsCodes } from '@/libs/propertiesUtils';
import { getEntryTypeInfo } from '@/libs/entryTypeInfo';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Window from '@/components/HubWindow.vue';
import EntryTypeInfoDialog from './EntryTypeInfoDialog.vue';
import { copyText } from '@/composables/useCopyText';

/**
 * PropsTable - Recursive object/array-to-PrimeVue-DataTable renderer.
 *
 * Supports drill-down into nested objects via an inline dialog.
 * Formats captureTime, bands, dimensions and other well-known keys.
 *
 * Props:
 *   obj      - The value to render (any JSON-compatible type).
 *   depth    - Current recursion depth (default: 0).
 *   maxDepth - Maximum drill-down depth before showing raw JSON (default: 3).
 *   copyableValues - { rowKey: { text, label } }: a copy button on that top-level row
 *                    copies text (nested tables do not get it).
 *   rowNotes - { rowKey: text }: a muted line under the value of that top-level row
 *              (e.g. "2 minutes ago" under the modified date).
 *   entryType - the entry type of the file shown: its top-level Type row opens a
 *               dialog that explains the type.
 *
 * EPSG and ESRI codes in string values link to their epsg.io page.
 */
export default {
    name: 'PropsTable',
    components: {
        DataTable,
        Column,
        Button,
        Window,
        EntryTypeInfoDialog,
        PropsTable: () => import('./PropsTable.vue')
    },
    // Root instance exposes a drill-down opener that any nested PropsTable can
    // call via inject, regardless of how deep PrimeVue cells nest the tree.
    provide() {
        if (this.depth === 0) {
            return {
                propsTableOpenDrillDown: (title, value) => this.openDrillDownRoot(title, value)
            };
        }
        return {};
    },
    inject: {
        propsTableOpenDrillDown: { default: null }
    },
    props: {
        obj: {
            type: [Object, Array],
            required: true
        },
        preserveOrder: {
            type: Boolean,
            default: false
        },
        depth: {
            type: Number,
            default: 0
        },
        maxDepth: {
            type: Number,
            default: 2
        },
        copyableValues: {
            type: Object,
            default: () => ({}),
        },
        rowNotes: {
            type: Object,
            default: () => ({}),
        },
        // A number; a string from a list response is read as its number
        entryType: {
            type: [Number, String],
            default: null
        }
    },
    data() {
        return {
            tObj: null,
            drillDownVisible: false,
            drillDownTitle: '',
            drillDownData: null,
            typeInfoVisible: false
        };
    },
    computed: {
        rows() {
            if (!this.tObj || typeof this.tObj !== 'object' || Array.isArray(this.tObj)) return [];
            return Object.entries(this.tObj).map(([key, val]) => ({
                key,
                displayKey: this.beautify(key),
                rawValue: val
            }));
        }
    },
    watch: {
        obj: {
            handler() {
                this.processObject();
            },
            deep: true
        }
    },
    created() {
        this.processObject();
    },
    methods: {
        processObject() {
            try {
                if (this.obj === null || this.obj === undefined) {
                    this.tObj = null;
                    return;
                }

                let tObj = clone(this.obj);

                if (tObj !== null && typeof tObj === 'object' && !Array.isArray(tObj)) {
                    tidyProperties(tObj);

                    if (!this.preserveOrder) {
                        tObj = sortObjectKeys(tObj);
                    }
                }

                this.tObj = tObj;
            } catch (error) {
                console.error('Error processing object in PropsTable:', error);
                this.tObj = { error: 'Error displaying data' };
            }
        },

        beautify: beautifyKey,

        isUrl,

        linkCrsCodes,

        // The top-level Type row of a file whose type has a description
        isEntryTypeRow(data) {
            return this.depth === 0 && data.key === 'type' && typeof data.rawValue === 'string' &&
                this.entryType !== null && getEntryTypeInfo(Number(this.entryType)) !== null;
        },

        // True if the value is an object/array that should be collapsed
        // behind a drill-down button (nested too deep or too large).
        shouldCollapse(value) {
            if (value === null || value === undefined) return false;
            if (typeof value !== 'object') return false;
            if (!isFinite(this.maxDepth)) return false;
            const nextDepth = this.depth + 1;
            if (nextDepth < this.maxDepth) return false;

            // Trivial containers stay inline
            if (Array.isArray(value)) {
                if (value.length === 0) return false;
                if (value.length <= 3 && value.every(v => v === null || typeof v !== 'object')) return false;
                return true;
            }
            const keys = Object.keys(value);
            if (keys.length === 0) return false;
            if (keys.length <= 3 && keys.every(k => value[k] === null || typeof value[k] !== 'object')) return false;
            return true;
        },

        collapsedLabel(value) {
            if (Array.isArray(value)) {
                return `View ${value.length} item${value.length === 1 ? '' : 's'}\u2026`;
            }
            const n = Object.keys(value).length;
            return `View ${n} propert${n === 1 ? 'y' : 'ies'}\u2026`;
        },

        openDrillDown(title, value) {
            if (typeof this.propsTableOpenDrillDown === 'function') {
                this.propsTableOpenDrillDown(title, value);
            } else {
                this.openDrillDownRoot(title, value);
            }
        },

        openDrillDownRoot(title, value) {
            this.drillDownTitle = title || 'Details';
            this.drillDownData = value;
            this.drillDownVisible = true;
        },

        // Copy a value to the clipboard and show a toast notification
        async copyValue({ text, label }) {
            try {
                await copyText(text);
                this.$notify.success(`${label[0].toUpperCase()}${label.slice(1)} copied to clipboard`, { summary: 'Copied' });
            } catch (e) {
                console.error('Failed to copy to clipboard:', e);
            }
        }
    }
};
</script>

<style scoped>
.props-table-wrapper {
    width: 100%;
}

.copyable-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
}

/* A small icon button after a value (copy, what is this type) */
.row-action-btn {
    flex-shrink: 0;
    padding: 2px !important;
    margin-left: 0.5rem !important;
}

.p-button-label {
    cursor: pointer !important;
}

.props-array-list {
    margin: 0;
    padding-left: 1rem;
}

/* Break at spaces first; a long hash or path still breaks anywhere */
.wrap {
    overflow-wrap: anywhere;
    white-space: normal;
}

.copyable-row a {
    color: var(--ddb-link);
}

.row-note {
    display: block;
    font-size: 0.75rem;
    color: var(--ddb-text-muted);
}

.bool-true {
    color: var(--ddb-success);
    font-weight: bold;
}

.bool-false {
    color: var(--ddb-danger);
    font-weight: bold;
}

.props-datatable :deep(.p-datatable-thead) {
    display: none;
}

/* Long labels wrap at spaces, so the table never gets wider than a narrow panel */
.props-datatable :deep(.p-datatable-tbody > tr > td:first-child) {
    font-weight: 600;
    width: 40%;
    vertical-align: top;
}

.props-datatable :deep(.p-datatable-tbody > tr > td) {
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    vertical-align: top;
}

/* Nested PropsTable inside a cell */
.props-datatable :deep(.p-datatable-tbody > tr > td .props-datatable) {
    margin: 0;
}
</style>
