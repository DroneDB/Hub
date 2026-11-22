<template>
    <Window id="measurement-list" title="Measurements" modal fixed-size size-class="dialog-md" @close="$emit('close')">
        <div class="measurement-list-content">
            <div v-if="measurements.length === 0" class="no-measurements">
                No measurements on the map.
            </div>
            <template v-else>
                <PrimeMessage v-if="duplicates.length" severity="warn" :closable="false" class="duplicate-refs" data-testid="duplicate-refs">
                    {{ duplicateText }}
                </PrimeMessage>
                <div v-if="filterable" class="measurement-filters">
                    <label for="ml-category-filter">Category</label>
                    <select id="ml-category-filter" v-model="categoryFilter" class="filter-select" data-testid="category-filter">
                        <option value="">All</option>
                        <option v-for="c in categoryOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                    <label for="ml-status-filter">Status</label>
                    <select id="ml-status-filter" v-model="statusFilter" class="filter-select" data-testid="status-filter">
                        <option value="">All</option>
                        <option v-for="c in statusOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </div>
                <div v-if="!visibleMeasurements.length" class="no-measurements">
                    No measurements match the filters.
                </div>
                <div v-else class="measurement-tree">
                    <!-- Groups -->
                    <template v-for="group in groupedStructure.groups" :key="group.id">
                        <!-- Group header row -->
                        <div class="group-row" :style="{ borderLeftColor: group.color }">
                            <button class="btn-icon btn-collapse" :title="collapsedGroups.has(group.id) ? 'Expand' : 'Collapse'" :aria-label="collapsedGroups.has(group.id) ? 'Expand' : 'Collapse'"
                                    @click="toggleGroupCollapse(group.id)">
                                <i :class="collapsedGroups.has(group.id) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" />
                            </button>
                            <button class="btn-icon btn-visibility" :title="group.visible ? 'Hide group' : 'Show group'" :aria-label="group.visible ? 'Hide group' : 'Show group'"
                                    @click="$emit('toggleGroupVisibility', group.id)">
                                <i :class="group.visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'" />
                            </button>
                            <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- double click is a shortcut for the Rename button -->
                            <span class="group-name" @dblclick="startRenameGroup(group)">{{ group.name }}</span>
                            <span class="group-count">({{ group.items.length }})</span>
                            <div class="group-actions">
                                <button class="btn-icon btn-rename" title="Rename group" aria-label="Rename group" @click="startRenameGroup(group)">
                                    <i class="fa-solid fa-pencil" />
                                </button>
                                <button class="btn-icon btn-delete-group" title="Delete group and its measurements" aria-label="Delete group and its measurements" @click="confirmDeleteGroup(group)">
                                    <i class="fa-solid fa-trash" />
                                </button>
                            </div>
                        </div>
                        <!-- Group measurements -->
                        <template v-if="!collapsedGroups.has(group.id)">
                            <div v-for="m in group.items" :key="'g-' + group.id + '-' + (m.feature && m.feature.ol_uid != null ? m.feature.ol_uid : m.name + m.type)"
                                 class="measurement-row measurement-row--nested">
                                <i :class="typeIcon(m.type)" class="type-icon" />
                                <span class="measurement-name">{{ m.name || typeLabel(m.type) }}</span>
                                <AnnotationChips :item="m" />
                                <span class="measurement-value">{{ m.value || '' }}</span>
                                <div class="measurement-actions">
                                    <select class="group-select" :value="m.groupId || ''"
                                            title="Move to group" aria-label="Move to group"
                                            @change="$emit('moveMeasurementToGroup', m, $event.target.value)">
                                        <option value="">Ungrouped</option>
                                        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                                    </select>
                                    <button v-if="canWorkOn(m)" class="btn-icon btn-stockpile" title="Work on this pile in Stockpile Volume"
                                            aria-label="Work on this pile in Stockpile Volume" data-testid="measurement-work-on-stockpile"
                                            @click="$emit('workOnStockpile', m)">
                                        <i :class="stockpileIcon" />
                                    </button>
                                    <button class="btn-icon btn-edit" title="Edit" aria-label="Edit" @click="$emit('editMeasurement', m)">
                                        <i class="fa-solid fa-pencil" />
                                    </button>
                                    <button class="btn-icon btn-delete" title="Delete" aria-label="Delete" @click="confirmDelete(m)">
                                        <i class="fa-solid fa-trash" />
                                    </button>
                                </div>
                            </div>
                        </template>
                    </template>

                    <!-- Ungrouped measurements -->
                    <template v-if="groupedStructure.ungrouped.length > 0">
                        <div v-if="groups.length > 0" class="group-row group-row--ungrouped">
                            <button class="btn-icon btn-collapse" :title="collapsedGroups.has('__ungrouped__') ? 'Expand' : 'Collapse'" :aria-label="collapsedGroups.has('__ungrouped__') ? 'Expand' : 'Collapse'"
                                    @click="toggleGroupCollapse('__ungrouped__')">
                                <i :class="collapsedGroups.has('__ungrouped__') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" />
                            </button>
                            <span class="group-name group-name--dim">Ungrouped</span>
                            <span class="group-count">({{ groupedStructure.ungrouped.length }})</span>
                        </div>
                        <template v-if="!collapsedGroups.has('__ungrouped__') || groups.length === 0">
                            <div v-for="m in groupedStructure.ungrouped" :key="'ung-' + (m.feature && m.feature.ol_uid != null ? m.feature.ol_uid : m.name + m.type)"
                                 class="measurement-row" :class="{ 'measurement-row--nested': groups.length > 0 }">
                                <i :class="typeIcon(m.type)" class="type-icon" />
                                <span class="measurement-name">{{ m.name || typeLabel(m.type) }}</span>
                                <AnnotationChips :item="m" />
                                <span class="measurement-value">{{ m.value || '' }}</span>
                                <div class="measurement-actions">
                                    <select v-if="groups.length > 0" class="group-select" :value="m.groupId || ''"
                                            title="Move to group" aria-label="Move to group"
                                            @change="$emit('moveMeasurementToGroup', m, $event.target.value)">
                                        <option value="">Ungrouped</option>
                                        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                                    </select>
                                    <button v-if="canWorkOn(m)" class="btn-icon btn-stockpile" title="Work on this pile in Stockpile Volume"
                                            aria-label="Work on this pile in Stockpile Volume" data-testid="measurement-work-on-stockpile"
                                            @click="$emit('workOnStockpile', m)">
                                        <i :class="stockpileIcon" />
                                    </button>
                                    <button class="btn-icon btn-edit" title="Edit" aria-label="Edit" @click="$emit('editMeasurement', m)">
                                        <i class="fa-solid fa-pencil" />
                                    </button>
                                    <button class="btn-icon btn-delete" title="Delete" aria-label="Delete" @click="confirmDelete(m)">
                                        <i class="fa-solid fa-trash" />
                                    </button>
                                </div>
                            </div>
                        </template>
                    </template>
                </div>
            </template>
        </div>

        <!-- Where the measurements go: the file of the one file on show, else of the folder -->
        <p v-if="savedPath" class="saved-path" data-testid="measurements-file">Saved in <span class="saved-path-file" data-testid="measurements-file-path">{{ savedPath }}</span></p>

        <!-- Footer toolbar -->
        <div class="measurement-list-footer">
            <button class="btn-new-group" title="Create a new group" @click="$emit('createGroup')">
                <i class="fa-solid fa-folder-plus" />
                New Group
            </button>
            <Button label="Close" severity="secondary" @click="$emit('close')" />
        </div>

        <!-- Confirm delete measurement -->
        <ConfirmDialog v-if="deleteConfirmOpen"
                       v-bind="deleteConfirmDialog"
                       @close="handleDeleteConfirm" />

        <!-- Confirm delete group -->
        <ConfirmDialog v-if="deleteGroupConfirmOpen"
                       v-bind="deleteGroupConfirmDialog"
                       @close="handleDeleteGroupConfirm" />
    </Window>
</template>

<script>
import Window from '@/components/HubWindow';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import AnnotationChips from '@/components/measurements/AnnotationChips.vue';
import { duplicateRefs } from '@/libs/map/annotationIds';
import { confirmDialogProps } from '@/libs/deleteConfirmation';
import { countOf } from '@/libs/format';
import { AREA_ICON, LENGTH_ICON, POINT_ICON, STOCKPILE_ICON } from '@/libs/glyphs';

export default {
    components: { Window, Button, ConfirmDialog, PrimeMessage, AnnotationChips },
    props: {
        measurements: {
            type: Array,
            default: () => []
        },
        groups: {
            type: Array,
            default: () => []
        },
        // The refs of the annotations of the same file that the map does not show (the 3D viewer's), repeats kept
        otherRefs: {
            type: Array,
            default: () => []
        },
        // The path of the file the measurements are saved in (empty: not known yet)
        savedPath: {
            type: String,
            default: ''
        },
        // Whether the map can open Stockpile Volume (an elevation model is on it): a pile then has a button that
        // chooses it there, to change its base, its material or its outline
        canWorkOnStockpiles: {
            type: Boolean,
            default: false
        }
    },
    emits: [
        'close',
        'deleteMeasurement',
        'editMeasurement',
        'createGroup',
        'renameGroup',
        'deleteGroup',
        'toggleGroupVisibility',
        'moveMeasurementToGroup',
        'workOnStockpile'
    ],
    data() {
        return {
            stockpileIcon: STOCKPILE_ICON,
            deleteConfirmOpen: false,
            pendingDeleteItem: null,
            deleteGroupConfirmOpen: false,
            pendingDeleteGroup: null,
            collapsedGroups: new Set(),
            // The filters of the list: a category or a status id, '' for all
            categoryFilter: '',
            statusFilter: ''
        };
    },
    computed: {
        deleteConfirmDialog() {
            const m = this.pendingDeleteItem;
            if (!m) return { message: '' };
            const name = m.name || this.typeLabel(m.type);
            return confirmDialogProps({ kind: 'measurement', items: [{ name, note: m.value ? `(${m.value})` : '' }] });
        },
        deleteGroupConfirmDialog() {
            const group = this.pendingDeleteGroup;
            if (!group) return { message: '' };
            const count = Array.isArray(group.items) ? group.items.length : null;
            return confirmDialogProps({
                kind: 'measurement group',
                items: [group.name],
                lost: [count === null ? 'all its measurements' : `its ${countOf(count, 'measurement')}`]
            });
        },
        // The distinct categories and statuses the measurements have, for the filters
        categoryOptions() {
            return this.optionsOf('category', 'categoryLabel');
        },
        statusOptions() {
            return this.optionsOf('status', 'statusLabel');
        },
        // A filter is useful once some measurement has a category or a status
        filterable() {
            return this.categoryOptions.length > 0 || this.statusOptions.length > 0;
        },
        visibleMeasurements() {
            return this.measurements.filter(m => (!this.categoryFilter || m.category === this.categoryFilter)
                && (!this.statusFilter || m.status === this.statusFilter));
        },
        // The references that more than one annotation of the file has, of the map or of the 3D viewer (a file edited
        // outside the Hub can have them)
        duplicates() {
            return duplicateRefs([...this.measurements.map(m => m.ref), ...this.otherRefs]);
        },
        duplicateText() {
            const refs = this.duplicates.join(', ');
            return `${this.duplicates.length === 1 ? 'Reference' : 'References'} ${refs} ${this.duplicates.length === 1 ? 'is' : 'are'} used by more than one measurement.`;
        },
        groupedStructure() {
            const groupMap = {};
            for (const g of this.groups) {
                groupMap[g.id] = { ...g, items: [] };
            }
            const ungrouped = [];
            for (const m of this.visibleMeasurements) {
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
        // The distinct values of a field of the measurements, with the name each is shown by
        optionsOf(key, labelKey) {
            const seen = new Map();
            this.measurements.forEach(m => { if (m[key] && !seen.has(m[key])) seen.set(m[key], m[labelKey] || m[key]); });
            return [...seen].map(([value, label]) => ({ value, label }));
        },
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
        canWorkOn(m) {
            return this.canWorkOnStockpiles && m.type === 'stockpile' && !!m.feature;
        },
        typeIcon(type) {
            switch (type) {
                case 'point': return POINT_ICON;
                case 'length': return LENGTH_ICON;
                case 'area': return AREA_ICON;
                case 'stockpile': return STOCKPILE_ICON;
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

.saved-path {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--ddb-text-muted);
    overflow-wrap: anywhere;
}

.measurement-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
}

.filter-select {
    font-size: 0.8rem;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    padding: 0.15rem 0.3rem;
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    max-width: 10rem;
}

.duplicate-refs {
    margin-bottom: 0.5rem;
}

.no-measurements {
    text-align: center;
    padding: 2rem;
    color: var(--ddb-text-muted);
    font-style: italic;
}

/* Group row */
.group-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    background-color: var(--ddb-bg-subtle);
    border-left: 3px solid var(--ddb-primary);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ddb-text);
    position: sticky;
    top: 0;
    z-index: 1;
}

.group-row--ungrouped {
    border-left-color: var(--ddb-border);
    font-weight: 500;
    color: var(--ddb-text-muted);
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
    color: var(--ddb-text-muted);
    font-weight: 400;
}

.group-actions {
    display: flex;
    gap: 0.1rem;
    opacity: 0;
    transition: opacity 0.15s;
}

.group-row:hover .group-actions,
.group-row:focus-within .group-actions {
    opacity: 1;
}

/* Measurement rows */
.measurement-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-size: 0.87rem;
}

.measurement-row--nested {
    padding-left: 2rem;
}

.measurement-row:hover {
    background-color: var(--ddb-bg-hover);
}

.type-icon {
    width: 1rem;
    color: var(--ddb-text-muted);
    flex-shrink: 0;
}

.measurement-name {
    flex: 1 1 6rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.measurement-value {
    font-size: 0.78rem;
    color: var(--ddb-text-muted);
    white-space: nowrap;
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.measurement-actions {
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: 0.1rem;
    opacity: 0;
    transition: opacity 0.15s;
}

.measurement-row:hover .measurement-actions,
.measurement-row:focus-within .measurement-actions {
    opacity: 1;
}

/* Group select dropdown */
.group-select {
    font-size: 0.75rem;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    padding: 0.1rem 0.25rem;
    background: var(--ddb-bg-surface);
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
    color: var(--ddb-text);
    line-height: 1;
}

.btn-icon:hover {
    background-color: rgba(var(--ddb-ink-rgb), 0.06);
}

.btn-delete,
.btn-delete-group {
    color: var(--ddb-danger);
}

.btn-delete:hover,
.btn-delete-group:hover {
    background-color: rgba(var(--ddb-danger-rgb), 0.1);
}

/* Footer */
.measurement-list-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: var(--ddb-border-width) solid var(--ddb-border);
}

.btn-new-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: var(--ddb-border-width) solid var(--ddb-border);
    padding: 0.35rem 0.75rem;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--ddb-text);
    transition: background-color 0.15s;
}

.btn-new-group:hover {
    background-color: var(--ddb-bg-hover);
}

/* A row is one line with a name that shrinks (min-width 0) while there is room; on a phone it wraps under the name */
@media (max-width: 575.98px) {
    .measurement-row {
        flex-wrap: wrap;
    }
}

/* Touch: the row actions cannot wait for a hover, and the controls are big enough to hit */
@media (hover: none), (max-width: 575.98px) {
    .group-actions,
    .measurement-actions {
        opacity: 1;
    }

    .btn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        min-height: 2rem;
        font-size: 0.9rem;
    }

    .group-select {
        min-height: 2rem;
    }

    .btn-new-group {
        min-height: 2.5rem;
    }
}
</style>
