<template>
    <Window id="measurement-list" title="Measurements" modal fixed-size size-class="dialog-lg" @close="$emit('close')">
        <div class="measurement-list-content">
            <div v-if="measurements.length === 0" class="no-measurements">
                No measurements on the map.
            </div>
            <template v-else>
                <PrimeMessage v-if="duplicates.length" severity="warn" :closable="false" class="duplicate-refs" data-testid="duplicate-refs">
                    {{ duplicateText }}
                </PrimeMessage>
                <div class="measurement-toolbar">
                    <input id="ml-select-all" type="checkbox" class="select-all" :checked="allState === 'all'" :indeterminate="allState === 'some'"
                           :disabled="!visibleMeasurements.length" data-testid="measurement-select-all" @change="toggleItems(visibleMeasurements)">
                    <label for="ml-select-all" class="select-all-label">Select all</label>
                    <SearchField v-model="search" class="measurement-search" label="Search measurements" placeholder="Search by name or reference"
                                 size="small" data-testid="measurement-search" />
                </div>
                <div v-if="filterable" class="measurement-filters">
                    <template v-if="typeOptions.length > 1">
                        <label for="ml-type-filter">Type</label>
                        <select id="ml-type-filter" v-model="typeFilter" class="filter-select" data-testid="type-filter">
                            <option value="">All</option>
                            <option v-for="c in typeOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                        </select>
                    </template>
                    <template v-if="categoryOptions.length">
                        <label for="ml-category-filter">Category</label>
                        <select id="ml-category-filter" v-model="categoryFilter" class="filter-select" data-testid="category-filter">
                            <option value="">All</option>
                            <option v-for="c in categoryOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                        </select>
                    </template>
                    <template v-if="statusOptions.length">
                        <label for="ml-status-filter">Status</label>
                        <select id="ml-status-filter" v-model="statusFilter" class="filter-select" data-testid="status-filter">
                            <option value="">All</option>
                            <option v-for="c in statusOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
                        </select>
                    </template>
                </div>
                <div v-if="!visibleMeasurements.length" class="no-measurements">
                    No measurements match the filters.
                </div>
                <!-- The list is one tab stop (the keyboard of useListNavigation), focused as the window opens; a row is selected as a file is -->
                <div v-else ref="tree" class="measurement-tree" role="grid" aria-label="Measurements" aria-multiselectable="true" tabindex="0" data-autofocus
                     :aria-activedescendant="nav.activeId.value" :data-owns-escape="selectedCount ? '' : undefined"
                     data-testid="measurement-tree" @keydown="onListKeydown">
                    <!-- Groups: a drop target each (the keyboard and touch move rows with Move to) -->
                    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                    <div v-for="group in groupedStructure.groups" :key="group.id" role="rowgroup" class="group-block"
                         :class="{ 'group-block--drop': dropGroupId === group.id }" :data-testid="`measurement-group-${group.id}`"
                         @dragover="onDragOver(group.id, $event)" @dragleave="onDragLeave(group.id, $event)" @drop="onDrop(group.id, $event)">
                        <div role="row">
                            <div role="gridcell" class="group-row" :style="{ borderLeftColor: group.color }">
                                <input type="checkbox" class="group-check" tabindex="-1" :checked="stateOf(group.items) === 'all'"
                                       :indeterminate="stateOf(group.items) === 'some'" :disabled="!group.items.length"
                                       :aria-label="`Select the measurements of ${group.name}`" data-testid="measurement-group-check"
                                       @change="toggleItems(group.items)">
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
                        </div>
                        <template v-if="!collapsedGroups.has(group.id)">
                            <MeasurementRow v-for="m in group.items" :key="'g-' + group.id + '-' + rowKey(m)" :item="m" nested
                                            v-bind="rowProps(m)" v-on="rowListeners(m)" />
                        </template>
                    </div>

                    <!-- Ungrouped measurements: a drop target too while there are groups -->
                    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                    <div v-if="groupedStructure.ungrouped.length > 0 || (draggedItems && groups.length > 0)" role="rowgroup" class="group-block"
                         :class="{ 'group-block--drop': dropGroupId === '' }" data-testid="measurement-group-ungrouped"
                         @dragover="onDragOver('', $event)" @dragleave="onDragLeave('', $event)" @drop="onDrop('', $event)">
                        <div v-if="groups.length > 0" role="row">
                            <div role="gridcell" class="group-row group-row--ungrouped">
                                <input type="checkbox" class="group-check" tabindex="-1" :checked="stateOf(groupedStructure.ungrouped) === 'all'"
                                       :indeterminate="stateOf(groupedStructure.ungrouped) === 'some'" :disabled="!groupedStructure.ungrouped.length"
                                       aria-label="Select the ungrouped measurements" data-testid="measurement-group-check"
                                       @change="toggleItems(groupedStructure.ungrouped)">
                                <button class="btn-icon btn-collapse" :title="collapsedGroups.has(UNGROUPED) ? 'Expand' : 'Collapse'" :aria-label="collapsedGroups.has(UNGROUPED) ? 'Expand' : 'Collapse'"
                                        @click="toggleGroupCollapse(UNGROUPED)">
                                    <i :class="collapsedGroups.has(UNGROUPED) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" />
                                </button>
                                <span class="group-name group-name--dim">Ungrouped</span>
                                <span class="group-count">({{ groupedStructure.ungrouped.length }})</span>
                            </div>
                        </div>
                        <template v-if="!collapsedGroups.has(UNGROUPED) || groups.length === 0">
                            <MeasurementRow v-for="m in groupedStructure.ungrouped" :key="'ung-' + rowKey(m)" :item="m" :nested="groups.length > 0"
                                            v-bind="rowProps(m)" v-on="rowListeners(m)" />
                        </template>
                    </div>
                </div>
            </template>
        </div>

        <MeasurementSelectionBar v-if="selectedCount" :count="selectedCount" :totals="totalsText" :groups="groups"
                                 @move-to="groupId => $emit('moveMeasurementsToGroup', selectedItems, groupId)"
                                 @show-on-map="$emit('showOnMap', selectedItems)"
                                 @export="format => $emit('exportMeasurements', selectedItems, format)"
                                 @delete="confirmDelete(selectedItems)" @clear="clearSelection" />

        <!-- Where the measurements go: the file of the one file on show, else of the folder -->
        <p v-if="savedPath" class="saved-path" data-testid="measurements-file">Saved in <span class="saved-path-file" data-testid="measurements-file-path">{{ savedPath }}</span></p>

        <!-- Footer toolbar -->
        <div class="measurement-list-footer">
            <Button severity="secondary" outlined size="small" icon="fa-solid fa-folder-plus" :label="newGroupLabel"
                    :title="selectedCount ? 'Make a new group of the selected measurements' : 'Create a new group'"
                    class="btn-new-group" data-testid="measurement-new-group" @click="$emit('createGroup', selectedItems)" />
            <Button label="Close" severity="secondary" @click="$emit('close')" />
        </div>

        <!-- What a drag of several rows shows under the pointer -->
        <div ref="dragBadge" class="drag-badge" aria-hidden="true" />

        <!-- Confirm delete measurements -->
        <ConfirmDialog v-if="pendingDeleteItems.length"
                       v-bind="deleteConfirmDialog"
                       @close="handleDeleteConfirm" />

        <!-- Confirm delete group -->
        <ConfirmDialog v-if="deleteGroupConfirmOpen"
                       v-bind="deleteGroupConfirmDialog"
                       @close="handleDeleteGroupConfirm" />
    </Window>
</template>

<script>
import { getCurrentInstance, nextTick, useId } from 'vue';
import Window from '@/components/HubWindow';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import SearchField from '@/components/SearchField.vue';
import MeasurementRow from './MeasurementRow.vue';
import MeasurementSelectionBar from './MeasurementSelectionBar.vue';
import { useFileSelection } from '@/composables/useFileSelection';
import { useListNavigation } from '@/composables/useListNavigation';
import { duplicateRefs } from '@/libs/map/annotationIds';
import { compareMeasurements, measurementName, measurementTypeLabel } from '@/libs/map/measurementTypes';
import { measurementTotalsText } from '@/libs/map/measurementTotals';
import { confirmDialogProps } from '@/libs/deleteConfirmation';
import { countOf } from '@/libs/format';

// The key of the Ungrouped rows in the collapsed set (a group id is never this)
const UNGROUPED = '__ungrouped__';
// The type of a drag of measurements: other drop targets of the page (the file list) do not take it
export const MEASUREMENT_DRAG_TYPE = 'application/x-ddb-measurements';

export default {
    components: { Window, Button, ConfirmDialog, PrimeMessage, SearchField, MeasurementRow, MeasurementSelectionBar },
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
        },
        // The units the totals of the selection are given in ('metric' or 'imperial')
        units: {
            type: String,
            default: 'metric'
        }
    },
    emits: [
        'close',
        'deleteMeasurements',
        'editMeasurement',
        'createGroup',
        'renameGroup',
        'deleteGroup',
        'toggleGroupVisibility',
        'moveMeasurementsToGroup',
        'workOnStockpile',
        'showOnMap',
        'exportMeasurements',
        'selectionChange'
    ],
    setup() {
        const instance = getCurrentInstance();
        return {
            // A measurement is selected by its feature, which stays the same when the map hands the list new rows;
            // ranges follow the rows on screen
            selection: useFileSelection(() => instance.proxy.shownRows, m => m.feature),
            nav: useListNavigation({
                count: () => instance.proxy.shownRows.length,
                horizontal: false,
                idPrefix: `${useId()}-measurement`,
                move: (index, mods) => instance.proxy.moveTo(index, mods),
                toggle: index => instance.proxy.selectAt(index, { ctrl: true }),
                open: index => instance.proxy.editAt(index)
            })
        };
    },
    data() {
        return {
            UNGROUPED,
            // The measurements the delete question is about (one row's, or the selected ones)
            pendingDeleteItems: [],
            deleteGroupConfirmOpen: false,
            pendingDeleteGroup: null,
            collapsedGroups: new Set(),
            // The filters of the list: a text, a type, a category or a status id, '' for all
            search: '',
            typeFilter: '',
            categoryFilter: '',
            statusFilter: '',
            // A drag: the rows dragged, and the group under the pointer ('' Ungrouped, null none)
            draggedItems: null,
            dropGroupId: null
        };
    },
    computed: {
        deleteConfirmDialog() {
            const items = this.pendingDeleteItems.map(m => ({ name: measurementName(m), note: m.value ? `(${m.value})` : '' }));
            if (!items.length) return { message: '' };
            return confirmDialogProps({ kind: 'measurement', items });
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
        // The distinct types, categories and statuses the measurements have, for the filters
        typeOptions() {
            return [...new Set(this.measurements.map(m => m.type))].map(value => ({ value, label: measurementTypeLabel(value) }));
        },
        categoryOptions() {
            return this.optionsOf('category', 'categoryLabel');
        },
        statusOptions() {
            return this.optionsOf('status', 'statusLabel');
        },
        // A filter is useful once there are measurements of more than one type, or some measurement has a category
        // or a status
        filterable() {
            return this.typeOptions.length > 1 || this.categoryOptions.length > 0 || this.statusOptions.length > 0;
        },
        // The measurements in the order of the list
        sortedMeasurements() {
            return [...this.measurements].sort(compareMeasurements);
        },
        visibleMeasurements() {
            const text = this.search.trim().toLowerCase();
            return this.sortedMeasurements.filter(m => (!this.typeFilter || m.type === this.typeFilter)
                && (!this.categoryFilter || m.category === this.categoryFilter)
                && (!this.statusFilter || m.status === this.statusFilter)
                && (!text || measurementName(m).toLowerCase().includes(text) || (m.ref || '').toLowerCase() === text));
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
        },
        // The rows on screen, in their order (a collapsed group's are not): what a Shift range and the arrows go through
        shownRows() {
            const rows = [];
            for (const g of this.groupedStructure.groups) {
                if (!this.collapsedGroups.has(g.id)) rows.push(...g.items);
            }
            if (!this.collapsedGroups.has(UNGROUPED) || this.groups.length === 0) rows.push(...this.groupedStructure.ungrouped);
            return rows;
        },
        rowIndex() {
            return new Map(this.shownRows.map((m, i) => [m.feature, i]));
        },
        // The selected measurements the filters show, in the order of the list (a collapsed group's too)
        selectedItems() {
            return this.visibleMeasurements.filter(m => this.selection.has(m));
        },
        selectedCount() {
            return this.selectedItems.length;
        },
        allState() {
            return this.stateOf(this.visibleMeasurements);
        },
        totalsText() {
            return measurementTotalsText(this.selectedItems, this.units);
        },
        newGroupLabel() {
            return this.selectedCount ? `New group from ${countOf(this.selectedCount, 'measurement')}` : 'New group';
        }
    },
    watch: {
        // A measurement that is gone, or that a filter hides, is no longer selected: an action never takes a row the
        // user does not see. The map marks the selected ones.
        selectedItems(items) {
            if (items.length !== this.selection.selected.value.size) this.selection.load(items);
            this.$emit('selectionChange', items);
        }
    },
    methods: {
        countOf,
        // The distinct values of a field of the measurements, with the name each is shown by
        optionsOf(key, labelKey) {
            const seen = new Map();
            this.measurements.forEach(m => { if (m[key] && !seen.has(m[key])) seen.set(m[key], m[labelKey] || m[key]); });
            return [...seen].map(([value, label]) => ({ value, label }));
        },
        rowKey(m) {
            return m.feature && m.feature.ol_uid != null ? m.feature.ol_uid : m.name + m.type;
        },
        rowProps(m) {
            const index = this.rowIndex.get(m.feature);
            return {
                rowId: index === undefined ? undefined : this.nav.idOf(index),
                selected: this.selection.has(m),
                active: index !== undefined && index === this.nav.active.value,
                draggable: this.groups.length > 0,
                canWorkOn: this.canWorkOnStockpiles && m.type === 'stockpile' && !!m.feature
            };
        },
        rowListeners(m) {
            return {
                select: mods => this.onRowSelect(m, mods),
                edit: item => this.$emit('editMeasurement', item),
                delete: item => this.confirmDelete([item]),
                workOnStockpile: item => this.$emit('workOnStockpile', item),
                dragStart: e => this.onDragStart(m, e),
                dragEnd: () => this.endDrag()
            };
        },

        // ---- Selection ----
        // Whether all, some or none of the rows are selected
        stateOf(items) {
            const selected = items.filter(m => this.selection.has(m)).length;
            if (!selected) return 'none';
            return selected === items.length ? 'all' : 'some';
        },
        // A check box of several rows: selects them all, or none of them when all were
        toggleItems(items) {
            const keys = new Set(items.map(m => m.feature));
            const others = this.selectedItems.filter(m => !keys.has(m.feature));
            this.selection.load(this.stateOf(items) === 'all' ? others : [...others, ...items]);
        },
        selectAll() {
            this.selection.load(this.visibleMeasurements);
        },
        clearSelection() {
            this.selection.clear();
        },
        selectAt(index, mods) {
            this.selection.toggle(index, mods);
        },
        // A click on a row: it becomes the keyboard's row, and the list takes the focus
        onRowSelect(m, mods) {
            const index = this.rowIndex.get(m.feature);
            if (index === undefined) return;
            this.nav.setActive(index);
            this.$refs.tree?.focus({ preventScroll: true });
            this.selectAt(index, mods);
        },

        // ---- Keyboard ----
        // The arrows move the selection with the active row; Ctrl+arrow moves the active row only
        moveTo(index, { extend, keepSelection }) {
            if (!keepSelection) this.selectAt(index, { shift: extend });
            this.reveal(index);
        },
        editAt(index) {
            const m = this.shownRows[index];
            if (m) this.$emit('editMeasurement', m);
        },
        async reveal(index) {
            await nextTick();
            document.getElementById(this.nav.idOf(index))?.scrollIntoView?.({ block: 'nearest' });
        },
        /** @param {KeyboardEvent} e */
        onListKeydown(e) {
            // Escape clears the selection first (the list owns the key while there is one), then closes the window
            if (e.key === 'Escape' && this.selectedCount) {
                e.preventDefault();
                this.clearSelection();
                return;
            }
            // The keys of a control in a row (its buttons) are the control's
            if (e.target !== e.currentTarget) return;
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.selectAll();
                return;
            }
            if (e.key === 'Delete' && this.selectedCount) {
                e.preventDefault();
                this.confirmDelete(this.selectedItems);
                return;
            }
            this.nav.onKeydown(e);
        },

        // ---- Drag and drop onto a group ----
        // A selected row takes the whole selection with it, another row goes alone
        /** @param {any} m @param {DragEvent} e */
        onDragStart(m, e) {
            const items = this.selection.has(m) ? this.selectedItems : [m];
            this.draggedItems = items;
            if (!e.dataTransfer) return;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(MEASUREMENT_DRAG_TYPE, String(items.length));
            if (items.length > 1 && this.$refs.dragBadge) {
                this.$refs.dragBadge.textContent = countOf(items.length, 'measurement');
                e.dataTransfer.setDragImage(this.$refs.dragBadge, 12, 12);
            }
        },
        endDrag() {
            this.draggedItems = null;
            this.dropGroupId = null;
        },
        /** @param {DragEvent} e */
        isOurDrag(e) {
            return !!this.draggedItems && !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes(MEASUREMENT_DRAG_TYPE);
        },
        /** @param {string} groupId @param {DragEvent} e */
        onDragOver(groupId, e) {
            if (!this.isOurDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.dropGroupId = groupId;
        },
        /** @param {string} groupId @param {DragEvent} e */
        onDragLeave(groupId, e) {
            if (this.dropGroupId !== groupId) return;
            const into = e.relatedTarget;
            if (!(into instanceof Node) || !(e.currentTarget instanceof Element) || !e.currentTarget.contains(into)) this.dropGroupId = null;
        },
        /** @param {string} groupId @param {DragEvent} e */
        onDrop(groupId, e) {
            if (!this.isOurDrag(e)) return;
            e.preventDefault();
            const moving = this.draggedItems.filter(m => (m.groupId || '') !== groupId);
            this.endDrag();
            if (moving.length) this.$emit('moveMeasurementsToGroup', moving, groupId);
        },

        // ---- Groups ----
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

        // ---- Delete ----
        confirmDelete(items) {
            this.pendingDeleteItems = [...items];
        },
        handleDeleteConfirm(result) {
            const items = this.pendingDeleteItems;
            this.pendingDeleteItems = [];
            if (result === 'confirm' && items.length) this.$emit('deleteMeasurements', items);
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

.measurement-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
}

.select-all {
    margin: 0;
    cursor: pointer;
}

.select-all-label {
    font-size: 0.85rem;
    white-space: nowrap;
    cursor: pointer;
}

.measurement-search {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: auto;
    max-width: 18rem;
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

.measurement-tree:focus-visible {
    outline: 2px solid var(--ddb-focus-ring-color, var(--ddb-primary));
    outline-offset: -2px;
}

/* The row the keyboard is on, while the keyboard is in the list (not after a click or a tap); its actions show */
.measurement-tree:focus-visible :deep(.measurement-row--active) {
    box-shadow: inset 0 0 0 2px var(--ddb-focus-ring-color, var(--ddb-primary));
}

.measurement-tree:focus-visible :deep(.measurement-row--active .measurement-actions) {
    opacity: 1;
}

/* A group and its rows: where a drag of rows can be dropped */
.group-block--drop {
    outline: 2px dashed var(--ddb-primary);
    outline-offset: -2px;
    background-color: var(--ddb-selected-bg);
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

.group-check {
    margin: 0;
    cursor: pointer;
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

.btn-delete-group {
    color: var(--ddb-danger);
}

.btn-delete-group:hover {
    background-color: rgba(var(--ddb-danger-rgb), 0.1);
}

/* Footer */
.measurement-list-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: var(--ddb-border-width) solid var(--ddb-border);
}

/* Drawn off screen: the browser takes a picture of it as the drag image of several rows */
.drag-badge {
    position: fixed;
    top: -100px;
    left: -100px;
    padding: 0.25rem 0.6rem;
    border-radius: var(--ddb-radius-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    box-shadow: var(--ddb-shadow-sm);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
}

/* Touch: the row actions cannot wait for a hover, and the controls are big enough to hit */
@media (hover: none), (max-width: 575.98px) {
    .group-actions {
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

    .group-check,
    .select-all {
        width: 1.25rem;
        height: 1.25rem;
    }

    .measurement-search {
        max-width: none;
    }
}
</style>
