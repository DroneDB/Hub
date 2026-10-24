<template>
    <div class="props-table-wrapper">
        <!-- Array at root level: render each item as a sub-table -->
        <div v-if="Array.isArray(tObj)" class="props-array-list">
            <div v-for="(item, index) in tObj" :key="index">
                <PropsTable :obj="item" :depth="depth" :max-depth="maxDepth" :copyable-values="copyableValues" />
            </div>
        </div>

        <!-- Object: render as DataTable -->
        <DataTable v-else-if="tObj !== null && typeof tObj === 'object'"
                   :value="rows"
                   size="small"
                   class="props-datatable">
            <Column field="displayKey" header="Property" style="white-space: nowrap; width: 40%;" />
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
                    <div v-else-if="data.rawValue !== null && typeof data.rawValue === 'string'" class="wrap copyable-row">
                        <a v-if="isUrl(data.rawValue)" :href="data.rawValue" target="_blank" rel="noopener noreferrer">{{ data.rawValue }}</a>
                        <template v-else>{{ data.rawValue }}</template>
                        <Button v-if="copyableValues && copyableValues[data.key]"
                                icon="fa-regular fa-copy"
                                size="small"
                                text
                                class="copy-btn"
                                title="Copy hash to clipboard" aria-label="Copy hash to clipboard"
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
                                :max-depth="maxDepth"
                                :copyable-values="copyableValues" />
                    <span v-else>-</span>
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
                        :preserve-order="preserveOrder"
                        :copyable-values="copyableValues" />
        </Window>
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '@/libs/utils';
import { tidyProperties, beautifyKey, isUrl } from '@/libs/propertiesUtils';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Window from '@/components/HubWindow.vue';
import { copyText } from '@/composables/useCopyText';

/**
 * PropsTable - Recursive object/array-to-PrimeVue-DataTable renderer.
 *
 * Replaces the legacy ObjTable with a PrimeVue-based implementation.
 * Supports drill-down into nested objects via an inline dialog.
 * Formats captureTime, bands, dimensions and other well-known keys.
 *
 * Props:
 *   obj      - The value to render (any JSON-compatible type).
 *   depth    - Current recursion depth (default: 0).
 *   maxDepth - Maximum drill-down depth before showing raw JSON (default: 3).
 */
export default {
    name: 'PropsTable',
    components: {
        DataTable,
        Column,
        Button,
        Window,
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
        }
    },
    data() {
        return {
            tObj: null,
            drillDownVisible: false,
            drillDownTitle: '',
            drillDownData: null
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
        async copyValue(text) {
            try {
                await copyText(text);
                this.$notify.success('Hash copied to clipboard', { summary: 'Copied' });
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

.copy-btn {
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

.wrap {
    word-wrap: break-word;
    word-break: break-all;
    white-space: normal;
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

.props-datatable :deep(.p-datatable-tbody > tr > td:first-child) {
    font-weight: 600;
    white-space: nowrap;
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
