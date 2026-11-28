<template>
    <!-- A row of the list (role grid): its one cell holds the controls. The keys are the list's (useListNavigation),
         which is one tab stop and names this row as its active one -->
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events -->
    <div :id="rowId" role="row" tabindex="-1" :aria-selected="String(selected)" class="measurement-row-wrap" :draggable="draggable"
         data-testid="measurement-row" @click="onClick" @dragstart="$emit('dragStart', $event)" @dragend="$emit('dragEnd', $event)">
        <div role="gridcell" class="measurement-row"
             :class="{ 'measurement-row--nested': nested, 'measurement-row--selected': selected, 'measurement-row--active': active }">
            <input type="checkbox" class="row-check" tabindex="-1" :checked="selected" :aria-label="`Select ${name}`"
                   data-testid="measurement-row-check" @click.stop="onCheck">
            <i :class="icon" class="type-icon" aria-hidden="true" />
            <span class="measurement-name" :title="name">{{ name }}</span>
            <AnnotationChips :item="item" />
            <span class="measurement-value">{{ item.value || '' }}</span>
            <div class="measurement-actions">
                <button v-if="canWorkOn" class="btn-icon btn-stockpile" title="Work on this pile in Stockpile Volume"
                        aria-label="Work on this pile in Stockpile Volume" data-testid="measurement-work-on-stockpile"
                        @click="$emit('workOnStockpile', item)">
                    <i :class="stockpileIcon" />
                </button>
                <button class="btn-icon btn-edit" title="Edit" aria-label="Edit" @click="$emit('edit', item)">
                    <i class="fa-solid fa-pencil" />
                </button>
                <button class="btn-icon btn-delete" title="Delete" aria-label="Delete" @click="$emit('delete', item)">
                    <i class="fa-solid fa-trash" />
                </button>
            </div>
        </div>
    </div>
</template>

<script>
/**
 * One measurement of the measurement list: a check box that selects it, its kind, name, annotation tags and value, and
 * its actions (shown on hover or focus, always on touch). A click on the row selects it as a file is selected (Ctrl or
 * Cmd toggles, Shift selects a range); the row can be dragged onto a group.
 */
import AnnotationChips from '@/components/measurements/AnnotationChips.vue';
import { measurementName, measurementTypeIcon } from '@/libs/map/measurementTypes';
import { STOCKPILE_ICON } from '@/libs/glyphs';

// A click on one of these is the control's, not a selection of the row
const CONTROLS = 'button, input, select, a, label';

export default {
    components: { AnnotationChips },
    props: {
        item: { type: Object, required: true },
        rowId: { type: String, default: undefined },
        selected: { type: Boolean, default: false },
        // The row the keyboard is on
        active: { type: Boolean, default: false },
        nested: { type: Boolean, default: false },
        draggable: { type: Boolean, default: true },
        canWorkOn: { type: Boolean, default: false }
    },
    emits: ['select', 'edit', 'delete', 'workOnStockpile', 'dragStart', 'dragEnd'],
    data() {
        return { stockpileIcon: STOCKPILE_ICON };
    },
    computed: {
        name() {
            return measurementName(this.item);
        },
        icon() {
            return measurementTypeIcon(this.item.type);
        }
    },
    methods: {
        /** @param {MouseEvent} e */
        onClick(e) {
            if (e.target instanceof Element && e.target.closest(CONTROLS)) return;
            this.$emit('select', { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
        },
        // The check box toggles the row (Shift: the range up to it), whatever else is selected
        /** @param {MouseEvent} e */
        onCheck(e) {
            this.$emit('select', e.shiftKey ? { shift: true } : { ctrl: true });
        }
    }
};
</script>

<style scoped>
.measurement-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-size: 0.87rem;
    cursor: default;
    user-select: none;
}

.measurement-row--nested {
    padding-left: 1.5rem;
}

.measurement-row:hover {
    background-color: var(--ddb-bg-hover);
}

.measurement-row--selected,
.measurement-row--selected:hover {
    background-color: var(--ddb-selected-bg);
}

.row-check {
    flex-shrink: 0;
    margin: 0;
    cursor: pointer;
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

.btn-delete {
    color: var(--ddb-danger);
}

.btn-delete:hover {
    background-color: rgba(var(--ddb-danger-rgb), 0.1);
}

/* A row is one line with a name that shrinks (min-width 0) while there is room; on a phone it wraps under the name */
@media (max-width: 575.98px) {
    .measurement-row {
        flex-wrap: wrap;
    }
}

/* Touch: the row actions cannot wait for a hover, and the controls are big enough to hit */
@media (hover: none), (max-width: 575.98px) {
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

    .row-check {
        width: 1.25rem;
        height: 1.25rem;
    }
}
</style>
