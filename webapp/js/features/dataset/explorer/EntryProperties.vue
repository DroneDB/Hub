<template>
    <Window id="properties" height="80%" width="40%" title="Properties"
            @close="$emit('close', $event, arguments[1])">
        <div v-if="files.length === 1" class="text-selectable">
            <PropsTable v-if="singleFileProperties" :obj="singleFileProperties" :preserve-order="true"
                        :copyable-values="singleFileCopyableValues" :row-notes="singleFileRowNotes" :entry-type="files[0].entry.type" />
        </div>
        <div v-if="files.length >= 2">
            <div class="multi-count">{{ files.length }} items</div>
            <DataTable :value="multiFileRows" size="small" :show-gridlines="true" class="multi-props-datatable">
                <Column field="key" style="font-weight: 600; width: 40%;" />
                <Column field="value" />
            </DataTable>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import PropsTable from '@/features/dataset/explorer/PropsTable.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { buildAllProperties, buildCopyableValues, buildRowNotes } from '@/libs/propertiesUtils';
import { describeSelection } from '@/libs/dataset/selection';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';

export default {
    name: 'EntryProperties',
    components: {
        Window, PropsTable, DataTable, Column
    },
    props: {
        files: { type: Array, default: () => [] }
    },
    emits: ['close'],
    setup() {
        // Lengths, speeds and areas follow the measurement units preference as it changes
        return { measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]) };
    },
    computed: {
        singleFileProperties() {
            if (!this.files || this.files.length !== 1) return null;
            return buildAllProperties(this.files[0], this.measureUnit);
        },
        singleFileCopyableValues() {
            return this.files && this.files.length === 1 ? buildCopyableValues(this.files[0]) : {};
        },
        singleFileRowNotes() {
            return this.files && this.files.length === 1 ? buildRowNotes(this.files[0]) : {};
        },
        multiFileRows() {
            if (!this.files || this.files.length < 2) return [];
            // The counts and the types are the selection summary's (libs/dataset/selection.js)
            const summary = describeSelection(this.files);
            return [
                { key: 'Size', value: summary.sizeText },
                { key: 'Type', value: summary.typesSummary }
            ];
        }
    }
}
</script>

<style scoped>
.multi-count {
    margin-bottom: 0.5rem;
    font-weight: 600;
}

.multi-props-datatable :deep(.p-datatable-thead) {
    display: none;
}

.multi-props-datatable :deep(.p-datatable-tbody > tr > td) {
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    vertical-align: top;
    overflow-wrap: anywhere;
}
</style>
