<template>
    <div class="selection-bar" role="toolbar" aria-label="Selected measurements" data-testid="measurement-selection-bar">
        <div class="selection-summary">
            <p class="selection-text">
                <span class="selection-count" data-testid="measurement-selection-count">{{ countText }}</span>
                <span v-if="totals" class="selection-totals" data-testid="measurement-selection-totals">{{ ` · ${totals}` }}</span>
            </p>
            <button type="button" class="btn-clear" title="Clear the selection" aria-label="Clear the selection"
                    data-testid="measurement-selection-clear" @click="$emit('clear')">
                <i class="fa-solid fa-xmark" aria-hidden="true" />
            </button>
        </div>
        <div class="selection-actions">
            <MenuButton v-if="groups.length" label="Move to" icon="fa-solid fa-folder-open" up :items="moveItems"
                        testid="measurement-move-to" @select="key => $emit('moveTo', key === UNGROUPED ? '' : key)" />
            <Button severity="secondary" outlined size="small" icon="fa-solid fa-crosshairs" label="Show on map"
                    data-testid="measurement-show-on-map" @click="$emit('showOnMap')" />
            <MenuButton label="Export" icon="fa-solid fa-download" up :items="exportItems" testid="measurement-export"
                        @select="key => $emit('export', key)" />
            <Button severity="danger" outlined size="small" icon="fa-solid fa-trash" label="Delete"
                    data-testid="measurement-delete-selected" @click="$emit('delete')" />
        </div>
    </div>
</template>

<script>
/**
 * The bar of the rows selected in the measurement list: how many, what they amount to (lengths, areas, volumes), and
 * what can be done with all of them at once. New group, which also takes the selection, is the list's own button.
 */
import Button from 'primevue/button';
import MenuButton from '@/components/MenuButton.vue';
import { countOf } from '@/libs/format';
import { EXPORT_CSV_ICON, EXPORT_GEOJSON_ICON } from '@/libs/glyphs';

// The Move to item that takes the measurements out of their group (a group id is never empty)
const UNGROUPED = '__ungrouped__';

export default {
    components: { Button, MenuButton },
    props: {
        count: { type: Number, required: true },
        // The text of the totals of the selection, empty when nothing selected has a size
        totals: { type: String, default: '' },
        groups: { type: Array, default: () => [] }
    },
    emits: ['moveTo', 'showOnMap', 'export', 'delete', 'clear'],
    data() {
        return { UNGROUPED };
    },
    computed: {
        countText() {
            return `${countOf(this.count, 'measurement')} selected`;
        },
        moveItems() {
            return [
                { key: UNGROUPED, label: 'Ungrouped', icon: 'fa-regular fa-folder' },
                ...this.groups.map(g => ({ key: g.id, label: g.name, icon: 'fa-solid fa-folder' }))
            ];
        },
        exportItems() {
            return [
                { key: 'geojson', label: 'GeoJSON', icon: EXPORT_GEOJSON_ICON },
                { key: 'csv', label: 'CSV', icon: EXPORT_CSV_ICON }
            ];
        }
    }
};
</script>

<style scoped>
.selection-bar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-selected-bg);
}

.selection-summary {
    display: flex;
    align-items: flex-start;
    gap: 0.35rem;
    font-size: 0.85rem;
}

/* The count and the totals wrap as text; the Clear button stays at the end of the first line */
.selection-text {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    line-height: 1.6;
}

.selection-count {
    font-weight: 600;
}

.selection-totals {
    color: var(--ddb-text-muted);
}

.btn-clear {
    flex-shrink: 0;
    background: none;
    border: none;
    border-radius: 0.25rem;
    padding: 0.2rem 0.4rem;
    color: var(--ddb-text);
    cursor: pointer;
}

.btn-clear:hover {
    background-color: rgba(var(--ddb-ink-rgb), 0.06);
}

.selection-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
}

@media (hover: none), (max-width: 575.98px) {
    .btn-clear {
        min-width: 2rem;
        min-height: 2rem;
    }
}
</style>
