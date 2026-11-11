<template>
    <!-- Several items: a window of the size of its content (a stable width, the height of what it lists), not a mostly empty 80 % one -->
    <Window id="properties" :height="multiple ? 'auto' : '80%'" :width="multiple ? 'auto' : '40%'" :size-class="multiple ? 'dialog-md' : null"
            :fixed-size="multiple" title="Properties" @close="$emit('close', $event, arguments[1])">
        <div v-if="files.length === 1" class="text-selectable">
            <!-- The dataset's own properties are read as words; its metadata as stored (ids, epoch times) is one click away (FR-EXP-25) -->
            <Button v-if="isDataset" class="raw-toggle" severity="secondary" text size="small"
                    :icon="showRaw ? 'fa-solid fa-eye-slash' : 'fa-solid fa-code'" :label="showRaw ? 'Hide raw metadata' : 'Show raw metadata'"
                    :aria-pressed="showRaw ? 'true' : 'false'" @click="showRaw = !showRaw" />
            <PropsTable v-if="singleFileProperties" :obj="singleFileProperties" :preserve-order="true"
                        :copyable-values="singleFileCopyableValues" :row-notes="singleFileRowNotes" :entry-type="files[0].entry.type" />
        </div>
        <div v-if="multiple" class="text-selectable">
            <div class="multi-count">{{ summary.summary }}</div>
            <DataTable :value="multiFileRows" size="small" :show-gridlines="true" class="multi-props-datatable">
                <Column field="key" style="font-weight: 600; width: 40%;" />
                <Column field="value" />
            </DataTable>
            <ul class="multi-names" aria-label="Selected items">
                <li v-for="name in summary.names" :key="name">{{ name }}</li>
                <li v-if="summary.more">and {{ summary.more }} more</li>
            </ul>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import PropsTable from '@/features/dataset/explorer/PropsTable.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { buildAllProperties, buildCopyableValues, buildRowNotes, isDatasetEntry } from '@/libs/propertiesUtils';
import { describeSelection } from '@/libs/dataset/selection';
import { usePreference } from '@/composables/usePreference';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { useDatasetSessionStore } from '@/stores/datasetSession';

export default {
    name: 'EntryProperties',
    components: {
        Window, PropsTable, DataTable, Column, Button
    },
    props: {
        files: { type: Array, default: () => [] }
    },
    emits: ['close'],
    setup() {
        // Lengths, speeds and areas follow the measurement units preference as it changes
        return { measureUnit: usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]), session: useDatasetSessionStore() };
    },
    data() {
        return { showRaw: false };
    },
    computed: {
        multiple() {
            return this.files.length >= 2;
        },
        // The same summary the detail panel gives: the count, the size, the types, the first names (FR-EXP-32)
        summary() {
            return describeSelection(this.files);
        },
        isDataset() {
            return this.files.length === 1 && isDatasetEntry(this.files[0].entry);
        },
        singleFileProperties() {
            if (!this.files || this.files.length !== 1) return null;
            return buildAllProperties(this.files[0], this.measureUnit, { raw: this.showRaw, created: this.session.creationDate });
        },
        singleFileCopyableValues() {
            return this.files && this.files.length === 1 ? buildCopyableValues(this.files[0]) : {};
        },
        singleFileRowNotes() {
            return this.files && this.files.length === 1 ? buildRowNotes(this.files[0]) : {};
        },
        multiFileRows() {
            if (!this.multiple) return [];
            // The counts and the types are the selection summary's (libs/dataset/selection.js)
            return [
                { key: 'Size', value: this.summary.sizeText },
                { key: 'Type', value: this.summary.typesSummary },
                { key: 'Types', value: this.summary.typesText }
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

.raw-toggle {
    margin-bottom: var(--ddb-spacing-sm);
}

.multi-names {
    margin: var(--ddb-spacing-sm) 0 0;
    padding-left: var(--ddb-spacing-xl);
    overflow-wrap: anywhere;
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
