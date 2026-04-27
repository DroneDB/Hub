<template>
    <Window title="Measurements" id="measurement-list" @onClose="$emit('onClose')" modal fixedSize sizeClass="dialog-md">
        <div class="measurement-list-content">
            <div v-if="measurements.length === 0" class="no-measurements">
                No measurements on the map.
            </div>
            <table v-else class="measurement-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th style="width: 3rem"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(m, index) in measurements" :key="index">
                        <td>{{ m.name || '-' }}</td>
                        <td>
                            <i :class="typeIcon(m.type)" style="margin-right: 0.25rem"></i>
                            {{ typeLabel(m.type) }}
                        </td>
                        <td>{{ m.value || '-' }}</td>
                        <td>
                            <button class="btn-delete-measurement" @click="confirmDelete(m)" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="d-flex justify-content-end mt-3 w-100">
            <Button label="Close" @click="$emit('onClose')" severity="secondary" />
        </div>
        <ConfirmDialog v-if="deleteConfirmOpen"
            title="Delete Measurement"
            :message="deleteConfirmMessage"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="handleDeleteConfirm" />
    </Window>
</template>

<script>
import Window from '@/components/Window';
import Button from 'primevue/button';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

export default {
    components: { Window, Button, ConfirmDialog },
    emits: ['onClose', 'deleteMeasurement'],
    props: {
        measurements: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            deleteConfirmOpen: false,
            pendingDeleteItem: null
        };
    },
    computed: {
        deleteConfirmMessage() {
            if (!this.pendingDeleteItem) return '';
            const name = this.pendingDeleteItem.name || this.typeLabel(this.pendingDeleteItem.type);
            const value = this.pendingDeleteItem.value ? ` (${this.pendingDeleteItem.value})` : '';
            return `Are you sure you want to delete "${name}${value}"?`;
        }
    },
    methods: {
        typeLabel(type) {
            switch (type) {
                case 'point': return 'Point';
                case 'length': return 'Length';
                case 'area': return 'Area';
                case 'stockpile': return 'Stockpile';
                case 'profile': return 'Profile';
                default: return type || 'Unknown';
            }
        },
        typeIcon(type) {
            switch (type) {
                case 'point': return 'fa-solid fa-map-pin';
                case 'length': return 'fa-solid fa-ruler';
                case 'area': return 'fa-solid fa-draw-polygon';
                case 'stockpile': return 'fa-solid fa-layer-group';
                case 'profile': return 'fa-solid fa-route';
                default: return 'fa-solid fa-question';
            }
        },
        confirmDelete(m) {
            this.pendingDeleteItem = m;
            this.deleteConfirmOpen = true;
        },
        handleDeleteConfirm(result) {
            this.deleteConfirmOpen = false;
            if (result === 'confirm' && this.pendingDeleteItem) {
                this.$emit('deleteMeasurement', this.pendingDeleteItem);
            }
            this.pendingDeleteItem = null;
        }
    }
};
</script>

<style scoped>
.measurement-list-content {
    min-height: 6rem;
    max-height: 60vh;
    overflow-y: auto;
}

.no-measurements {
    text-align: center;
    padding: 2rem;
    color: var(--text-color-secondary, #888);
    font-style: italic;
}

.measurement-table {
    width: 100%;
    border-collapse: collapse;
}

.measurement-table th,
.measurement-table td {
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: var(--ddb-border-width, 1px) solid var(--surface-border, #dee2e6);
}

.measurement-table th {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-color-secondary, #888);
}

.measurement-table tbody tr:hover {
    background-color: var(--surface-hover, rgba(0,0,0,0.04));
}

.btn-delete-measurement {
    background: none;
    border: none;
    color: var(--ddb-danger, #dc3545);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.85rem;
}

.btn-delete-measurement:hover {
    background-color: rgba(220, 53, 69, 0.1);
}
</style>
