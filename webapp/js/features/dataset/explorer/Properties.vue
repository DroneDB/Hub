<template>
    <Window height="80%" width="40%" title="Properties" id="properties"
        @onClose="$emit('onClose', $event, arguments[1])">
        <div v-if="files.length === 1" class="text-selectable">
            <PropsTable v-if="singleFileProperties" :obj="singleFileProperties" :preserveOrder="true" />
        </div>
        <div v-if="files.length >= 2">
            <div class="multi-count">{{ files.length }} items</div>
            <DataTable :value="multiFileRows" size="small" :showGridlines="true" class="multi-props-datatable">
                <Column field="key" style="font-weight: 600; width: 40%; white-space: nowrap;" />
                <Column field="value" />
            </DataTable>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import PropsTable from '@/components/PropsTable.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { buildAllProperties, getFileTypeName } from '@/libs/propertiesUtils';
import { bytesToSize } from '@/libs/utils';

export default {
    components: {
        Window, PropsTable, DataTable, Column
    },
    props: ['files'],
    emits: ['onClose'],
    computed: {
        singleFileProperties() {
            if (!this.files || this.files.length !== 1) return null;
            return buildAllProperties(this.files[0]);
        },
        multiFileRows() {
            if (!this.files || this.files.length < 2) return [];
            return [
                { key: 'Size', value: this.sumSizes(this.files) },
                { key: 'Type', value: this.typesToHuman(this.files) }
            ];
        }
    },
    methods: {
        typesToHuman(files) {
            if (!files || !files.length) return "";
            const types = {};
            files.forEach(f => types[getFileTypeName(f.entry.type)] = true);
            const keys = Object.keys(types);
            if (keys.length >= 2) return "Multiple types";
            return "All of type " + getFileTypeName(files[0].entry.type);
        },

        sumSizes(files) {
            let sum = 0;
            files.forEach(f => { if (f.entry) sum += f.entry.size; });
            return bytesToSize(sum);
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
}
</style>
