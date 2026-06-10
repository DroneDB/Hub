<template>
    <Window title="Measurements" id="measurement-list" @onClose="$emit('onClose')" modal fixedSize sizeClass="dialog-md">
        <div class="measurement-list-content">
            <div v-if="measurements.length === 0" class="no-measurements">
                No measurements on the map.
            </div>
            <div v-else class="measurement-tree">
                <!-- Groups -->
                <template v-for="group in groupedStructure.groups" :key="group.id">
                    <!-- Group header row -->
                    <div class="group-row" :style="{ borderLeftColor: group.color }">
                        <button class="btn-icon btn-collapse" @click="toggleGroupCollapse(group.id)"
                            :title="collapsedGroups.has(group.id) ? 'Expand' : 'Collapse'">
                            <i :class="collapsedGroups.has(group.id) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
                        </button>
                        <button class="btn-icon btn-visibility" @click="$emit('toggleGroupVisibility', group.id)"
                            :title="group.visible ? 'Hide group' : 'Show group'">
                            <i :class="group.visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'"></i>
                        </button>
                        <span class="group-name" @dblclick="startRenameGroup(group)">{{ group.name }}</span>
                        <span class="group-count">({{ group.items.length }})</span>
                        <div class="group-actions">
                            <button class="btn-icon btn-rename" @click="startRenameGroup(group)" title="Rename group">
                                <i class="fa-solid fa-pencil"></i>
                            </button>
                            <button class="btn-icon btn-delete-group" @click="confirmDeleteGroup(group)" title="Delete group and its measurements">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Group measurements -->
                    <template v-if="!collapsedGroups.has(group.id)">
                        <div v-for="m in group.items" :key="'g-' + group.id + '-' + (m.feature && m.feature.ol_uid != null ? m.feature.ol_uid : m.name + m.type)"
                            class="measurement-row measurement-row--nested">
                            <i :class="typeIcon(m.type)" class="type-icon"></i>
                            <span class="measurement-name">{{ m.name || typeLabel(m.type) }}</span>
                            <span class="measurement-value">{{ m.value || '' }}</span>
                            <div class="measurement-actions">
                                <select class="group-select" :value="m.groupId || ''"
                                    @change="$emit('moveMeasurementToGroup', m, $event.target.value)"
                                    title="Move to group">
                                    <option value="">Ungrouped</option>
                                    <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                                </select>
                                <button class="btn-icon btn-edit" @click="$emit('editMeasurement', m)" title="Edit">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                                <button class="btn-icon btn-delete" @click="confirmDelete(m)" title="Delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </template>
                </template>

                <!-- Ungrouped measurements -->
                <template v-if="groupedStructure.ungrouped.length > 0">
                    <div v-if="groups.length > 0" class="group-row group-row--ungrouped">
                        <button class="btn-icon btn-collapse" @click="toggleGroupCollapse('__ungrouped__')"
                            :title="collapsedGroups.has('__ungrouped__') ? 'Expand' : 'Collapse'">
                            <i :class="collapsedGroups.has('__ungrouped__') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
                        </button>
                        <span class="group-name group-name--dim">Ungrouped</span>
                        <span class="group-count">({{ groupedStructure.ungrouped.length }})</span>
                    </div>
                    <template v-if="!collapsedGroups.has('__ungrouped__') || groups.length === 0">
                        <div v-for="m in groupedStructure.ungrouped" :key="'ung-' + (m.feature && m.feature.ol_uid != null ? m.feature.ol_uid : m.name + m.type)"
                            class="measurement-row" :class="{ 'measurement-row--nested': groups.length > 0 }">
                            <i :class="typeIcon(m.type)" class="type-icon"></i>
                            <span class="measurement-name">{{ m.name || typeLabel(m.type) }}</span>
                            <span class="measurement-value">{{ m.value || '' }}</span>
                            <div class="measurement-actions">
                                <select v-if="groups.length > 0" class="group-select" :value="m.groupId || ''"
                                    @change="$emit('moveMeasurementToGroup', m, $event.target.value)"
                                    title="Move to group">
                                    <option value="">Ungrouped</option>
                                    <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                                </select>
                                <button class="btn-icon btn-edit" @click="$emit('editMeasurement', m)" title="Edit">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                                <button class="btn-icon btn-delete" @click="confirmDelete(m)" title="Delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </template>
                </template>
            </div>
        </div>

        <!-- Footer toolbar -->
        <div class="measurement-list-footer">
            <button class="btn-new-group" @click="$emit('createGroup')" title="Create a new group">
                <i class="fa-solid fa-folder-plus"></i>
                New Group
            </button>
            <Button label="Close" @click="$emit('onClose')" severity="secondary" />
        </div>

        <!-- Confirm delete measurement -->
        <ConfirmDialog v-if="deleteConfirmOpen"
            title="Delete Measurement"
            :message="deleteConfirmMessage"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="handleDeleteConfirm" />

        <!-- Confirm delete group -->
        <ConfirmDialog v-if="deleteGroupConfirmOpen"
            title="Delete Group"
            :message="deleteGroupConfirmMessage"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="handleDeleteGroupConfirm" />
    </Window>
</template>

<script>
import Window from '@/components/Window';
import Button from 'primevue/button';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

export default {
    components: { Window, Button, ConfirmDialog },
    emits: [
        'onClose',
        'deleteMeasurement',
        'editMeasurement',
        'createGroup',
        'renameGroup',
        'deleteGroup',
        'toggleGroupVisibility',
        'moveMeasurementToGroup'
    ],
    props: {
        measurements: {
            type: Array,
            default: () => []
        },
        groups: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            deleteConfirmOpen: false,
            pendingDeleteItem: null,
            deleteGroupConfirmOpen: false,
            pendingDeleteGroup: null,
            collapsedGroups: new Set()
        };
    },
    computed: {
        deleteConfirmMessage() {
            if (!this.pendingDeleteItem) return '';
            const name = this.pendingDeleteItem.name || this.typeLabel(this.pendingDeleteItem.type);
            const value = this.pendingDeleteItem.value ? ` (${this.pendingDeleteItem.value})` : '';
            return `Are you sure you want to delete "${name}${value}"?`;
        },
        deleteGroupConfirmMessage() {
            if (!this.pendingDeleteGroup) return '';
            return `Delete group "${this.pendingDeleteGroup.name}" and all its measurements?`;
        },
        groupedStructure() {
            const groupMap = {};
            for (const g of this.groups) {
                groupMap[g.id] = { ...g, items: [] };
            }
            const ungrouped = [];
            for (const m of this.measurements) {
                const gid = m.groupId;
                if (gid && groupMap[gid]) {
                    groupMap[gid].items.push(m);
                } else {
                    ungrouped.push(m);
                }
            }
            return {
                groups: Object.values(groupMap),
                ungrouped
            };
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
                case 'contour': return 'Contour';
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
                case 'contour': return 'fa-solid fa-map-pin';
                default: return 'fa-solid fa-question';
            }
        },
        toggleGroupCollapse(id) {
            if (this.collapsedGroups.has(id)) {
                this.collapsedGroups.delete(id);
            } else {
                this.collapsedGroups.add(id);
            }
            // Trigger reactivity for Set
            this.collapsedGroups = new Set(this.collapsedGroups);
        },
        startRenameGroup(group) {
            this.$emit('renameGroup', group);
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
        },
        confirmDeleteGroup(group) {
            this.pendingDeleteGroup = group;
            this.deleteGroupConfirmOpen = true;
        },
        handleDeleteGroupConfirm(result) {
            this.deleteGroupConfirmOpen = false;
            if (result === 'confirm' && this.pendingDeleteGroup) {
                this.$emit('deleteGroup', this.pendingDeleteGroup);
            }
            this.pendingDeleteGroup = null;
        }
    }
};
</script>

<style scoped>
.measurement-list-content {
    min-height: 6rem;
    max-height: 55vh;
    overflow-y: auto;
}

.no-measurements {
    text-align: center;
    padding: 2rem;
    color: var(--text-color-secondary, #888);
    font-style: italic;
}

/* Group row */
.group-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    background-color: var(--surface-section, rgba(0,0,0,0.03));
    border-left: 3px solid var(--ddb-primary, #3388ff);
    border-bottom: var(--ddb-border-width, 1px) solid var(--surface-border, #dee2e6);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ddb-text);
    position: sticky;
    top: 0;
    z-index: 1;
}

.group-row--ungrouped {
    border-left-color: var(--ddb-border, #dee2e6);
    font-weight: 500;
    color: var(--text-color-secondary, #888);
}

.group-name {
    flex: 1;
    cursor: default;
}

.group-name--dim {
    font-style: italic;
}

.group-count {
    font-size: 0.78rem;
    color: var(--text-color-secondary, #888);
    font-weight: 400;
}

.group-actions {
    display: flex;
    gap: 0.1rem;
    opacity: 0;
    transition: opacity 0.15s;
}

.group-row:hover .group-actions {
    opacity: 1;
}

/* Measurement rows */
.measurement-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-bottom: var(--ddb-border-width, 1px) solid var(--surface-border, #dee2e6);
    font-size: 0.87rem;
}

.measurement-row--nested {
    padding-left: 2rem;
}

.measurement-row:hover {
    background-color: var(--surface-hover, rgba(0,0,0,0.04));
}

.type-icon {
    width: 1rem;
    color: var(--text-color-secondary, #888);
    flex-shrink: 0;
}

.measurement-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.measurement-value {
    font-size: 0.78rem;
    color: var(--text-color-secondary, #888);
    white-space: nowrap;
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.measurement-actions {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    opacity: 0;
    transition: opacity 0.15s;
}

.measurement-row:hover .measurement-actions {
    opacity: 1;
}

/* Group select dropdown */
.group-select {
    font-size: 0.75rem;
    border: var(--ddb-border-width, 1px) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    padding: 0.1rem 0.25rem;
    background: var(--surface-0, #fff);
    color: var(--ddb-text);
    cursor: pointer;
    max-width: 7rem;
}

/* Icon buttons */
.btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.78rem;
    color: var(--ddb-text, #495057);
    line-height: 1;
}

.btn-icon:hover {
    background-color: rgba(0, 0, 0, 0.06);
}

.btn-delete,
.btn-delete-group {
    color: var(--ddb-danger, #dc3545);
}

.btn-delete:hover,
.btn-delete-group:hover {
    background-color: rgba(220, 53, 69, 0.1);
}

/* Footer */
.measurement-list-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: var(--ddb-border-width, 1px) solid var(--surface-border, #dee2e6);
}

.btn-new-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: var(--ddb-border-width, 1px) solid var(--ddb-border);
    padding: 0.35rem 0.75rem;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--ddb-text);
    transition: background-color 0.15s;
}

.btn-new-group:hover {
    background-color: var(--surface-hover, rgba(0, 0, 0, 0.04));
}
</style>
