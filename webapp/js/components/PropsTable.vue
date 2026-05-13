<template>
    <div class="props-table-wrapper">
        <!-- Array at root level: render each item as a sub-table -->
        <div v-if="Array.isArray(tObj)" class="props-array-list">
            <div v-for="(item, index) in tObj" :key="index">
                <PropsTable :obj="item" :depth="depth" :maxDepth="maxDepth" />
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
                    <div v-else-if="data.rawValue !== null && typeof data.rawValue === 'string'" class="wrap">
                        <a v-if="isUrl(data.rawValue)" :href="data.rawValue" target="_blank" rel="noopener noreferrer">{{ data.rawValue }}</a>
                        <template v-else>{{ data.rawValue }}</template>
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
                        :maxDepth="maxDepth" />
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
        <Dialog v-if="depth === 0"
            v-model:visible="drillDownVisible"
            :header="drillDownTitle"
            modal
            dismissable-mask
            :style="{ width: '75vw', maxWidth: '1100px' }"
            :contentStyle="{ maxHeight: '75vh', overflow: 'auto' }">
            <PropsTable v-if="drillDownVisible"
                :obj="drillDownData"
                :depth="0"
                :maxDepth="Infinity"
                :preserveOrder="preserveOrder" />
        </Dialog>
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '@/libs/utils';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

export default {
    name: 'PropsTable',
    components: {
        DataTable,
        Column,
        Button,
        Dialog,
        PropsTable: () => import('./PropsTable.vue')
    },
    props: {
        obj: {
            required: true,
            default: null
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
    created() {
        this.processObject();
    },
    watch: {
        obj: {
            handler() {
                this.processObject();
            },
            deep: true
        }
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
    methods: {
        processObject() {
            try {
                if (this.obj === null || this.obj === undefined) {
                    this.tObj = null;
                    return;
                }

                let tObj = clone(this.obj);

                if (tObj !== null && typeof tObj === 'object' && !Array.isArray(tObj)) {
                    // GeoImage adjustments
                    if (tObj.geotransform && Array.isArray(tObj.geotransform) && tObj.geotransform.length > 1) {
                        tObj.resolution = (tObj.geotransform[1]).toFixed(2) + ' meters';
                        delete tObj.geotransform;
                    }

                    // Image / GeoImage: merge width + height into Dimensions
                    if (tObj.width !== undefined && tObj.height !== undefined) {
                        tObj['Dimensions'] = `${tObj.width} x ${tObj.height}`;
                        delete tObj.width;
                        delete tObj.height;
                    }

                    // Point cloud / GeoImage adjustments
                    delete tObj.projection;

                    // GeoImage adjustments
                    delete tObj.focalLength35;
                    delete tObj.orientation;

                    if (tObj.sensor) {
                        tObj.sensor = tObj.sensor.toUpperCase();
                    }

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

        beautify(name) {
            if (typeof name !== 'string') return name;
            return name[0].toUpperCase() + name.substring(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
        },

        isUrl(str) {
            if (!str) return false;
            try {
                const url = new URL(str);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (e) {
                return false;
            }
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
        }
    }
};
</script>

<style scoped>
.props-table-wrapper {
    width: 100%;
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
