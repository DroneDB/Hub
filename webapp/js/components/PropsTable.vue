<template>
    <div class="props-table-wrapper">
        <!-- Array at root level: render each item as a sub-table -->
        <ul v-if="Array.isArray(tObj)" class="props-array-list">
            <li v-for="(item, index) in tObj" :key="index">
                <PropsTable :obj="item" />
            </li>
        </ul>

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
                    <PropsTable v-else-if="data.rawValue !== null && data.rawValue !== undefined" :obj="data.rawValue" />
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
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '@/libs/utils';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

export default {
    name: 'PropsTable',
    components: {
        DataTable,
        Column,
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
        }
    },
    data() {
        return {
            tObj: null
        };
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
        }
    }
};
</script>

<style scoped>
.props-table-wrapper {
    width: 100%;
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
