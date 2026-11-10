<template>
    <div v-if="layers.length > 0 || canAdd" class="raster-opacity-panel map-bottom-panel" :class="{ 'is-folded': folded && layers.length > 0 }">
        <!-- The panel is the root node, so the rules for the sheets over the map find it: no comment beside it. A view
             of a file that is not a georaster has no rows, but still the action that adds one (and nothing to fold) -->
        <!-- On a phone the panel folds to this line; above that the header is not shown -->
        <div v-if="layers.length > 0" class="layers-header">
            <span class="layers-title">Layers ({{ layers.length }})</span>
            <button class="fold-toggle" type="button" :title="foldLabel" :aria-label="foldLabel"
                    :aria-expanded="String(!folded)" @click="toggleFold">
                <i class="fas" :class="folded ? 'fa-chevron-up' : 'fa-chevron-down'" />
            </button>
        </div>
        <!-- The two halves of a row are two lines on a phone and dissolve into one line elsewhere -->
        <div v-for="(layer, index) in layers" :key="layer.path" class="raster-opacity-row"
             :class="{ 'raster-opacity-row--hidden': !layer.placeholder && layer.visible === false, 'raster-opacity-row--placeholder': !!layer.placeholder }">
            <div class="row-head">
                <span class="raster-label" :title="layer.name">{{ labels[index] }}</span>
                <span v-if="isChanged(layer)" class="changed-badge" :title="CHANGED_TEXT"><i class="fa-solid fa-circle-info" /> {{ CHANGED_TEXT }}</span>
                <span v-if="layer.placeholder" class="placeholder-text" :title="placeholderText(layer)">{{ placeholderText(layer) }}</span>
                <!-- Pressed = the layer is shown; the name stays the same, the state is aria-pressed -->
                <button v-if="!layer.placeholder" class="row-btn eye-btn" type="button"
                        :aria-pressed="layer.visible !== false ? 'true' : 'false'"
                        :aria-label="'Visibility of ' + layer.name"
                        :title="layer.visible !== false ? 'Hide layer' : 'Show layer'"
                        @click.stop="$emit('toggle-visible', layer.path)">
                    <i class="fa-solid" :class="layer.visible !== false ? 'fa-eye' : 'fa-eye-slash'" />
                </button>
            </div>
            <div class="row-controls">
                <input
                    v-if="!layer.placeholder"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    :value="layer.opacity"
                    :title="'Opacity: ' + Math.round(layer.opacity * 100) + '%'"
                    :aria-label="'Opacity of ' + layer.name"
                    @input="onInput(layer, $event)"
                >
                <span v-if="!layer.placeholder" class="opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
                <button v-if="layer.plantHealthCapable" class="ph-btn"
                        :class="{ active: activePlantHealthPath === layer.path }"
                        title="Plant Health" aria-label="Plant Health"
                        @click.stop="$emit('plant-health', layer.path)">
                    <i class="fa-solid fa-leaf" />
                </button>
                <button v-if="repickable && layer.placeholder && layer.placeholder.kind === 'missing'" class="row-btn"
                        title="Pick another raster" aria-label="Pick another raster" @click.stop="$emit('repick', layer.path)">
                    <i class="fa-solid fa-arrows-rotate" />
                </button>
                <!-- Where the layer is: the map fits its extent (FR-MAP-08) -->
                <!-- A raster that is building has no layer yet, but a footprint to look at (FR-RAS-09) -->
                <button v-if="!layer.placeholder || layer.placeholder.footprint" class="row-btn zoom-btn" type="button" title="Zoom to layer"
                        :aria-label="'Zoom to layer: ' + layer.name" @click.stop="$emit('zoom-to', layer.path)">
                    <i class="fa-solid fa-location-crosshairs" />
                </button>
                <button v-if="layers.length > 1 && isRemovable(layer)" class="row-btn" type="button" title="Remove layer" :aria-label="'Remove layer: ' + layer.name"
                        @click.stop="$emit('remove', layer.path)">
                    <i class="fa-solid fa-xmark" />
                </button>
                <div v-if="layers.length > 1" class="order-buttons">
                    <button
                        class="order-btn"
                        :class="{ 'order-btn--hidden': index === 0 }"
                        :disabled="index === 0"
                        title="Move layer up" aria-label="Move layer up"
                        @click="index > 0 && onReorder(index, index - 1)"
                    ><i class="fa-solid fa-chevron-up" /></button>
                    <button
                        class="order-btn"
                        :class="{ 'order-btn--hidden': index === layers.length - 1 }"
                        :disabled="index === layers.length - 1"
                        title="Move layer down" aria-label="Move layer down"
                        @click="index < layers.length - 1 && onReorder(index, index + 1)"
                    ><i class="fa-solid fa-chevron-down" /></button>
                </div>
            </div>
        </div>
        <AddLayerButton v-if="canAdd" class="add-layer" :disabled="addDisabled" :reason="addTitle" @click.stop="$emit('add')" />
    </div>
</template>

<script>
import { inject } from 'vue';
import AddLayerButton from './AddLayerButton.vue';
import { distinctLabels, formatNumber } from '@/libs/format';

// The longest name a row shows; a longer one is cut in the middle, so its date and extension stay
const LABEL_MAX = 22;

const CHANGED_TEXT = 'Changed since this view was saved';

export default {
    components: { AddLayerButton },
    props: {
        layers: {
            type: Array,
            default: () => []
        },
        activePlantHealthPath: {
            type: String,
            default: null
        },
        // Each row can be removed (the map viewer); a row with its own `removable` flag decides for
        // itself. The last row is never removable, whatever these say
        removable: {
            type: Boolean,
            default: false
        },
        // Only the rows of these paths can be removed (the layers added to a single-file map),
        // without a flag on the rows, which `update:layers` would hand back to the parent; null
        // leaves it to `removable`
        removablePaths: {
            type: Array,
            default: null
        },
        // Picking another file for a missing layer; left out, it follows `removable`. The explicit
        // undefined default keeps "not given" apart from false, which Vue would otherwise cast to
        canRepick: {
            type: Boolean,
            default: undefined
        },
        // The action that adds a layer: shown with canAdd, off with addDisabled, which says why in addTitle
        canAdd: {
            type: Boolean,
            default: false
        },
        addDisabled: {
            type: Boolean,
            default: false
        },
        addTitle: {
            type: String,
            default: ''
        },
        // Paths of the rows whose file changed since the view was saved; those rows get a badge
        changedPaths: {
            type: Array,
            default: () => []
        }
    },
    emits: ['update:layers', 'reorder', 'plant-health', 'remove', 'repick', 'toggle-visible', 'add', 'zoom-to'],
    setup() {
        // The size class of the map (MapCore provides it); a panel mounted without one is on a map that is not narrow
        return { CHANGED_TEXT, mapSize: inject('mapSize', null) };
    },
    data() {
        return {
            // Only a phone shows the fold toggle (the CSS hides it elsewhere, and the rows come back
            // with the width); the rows stay mounted when folded, so their settings are kept
            folded: false,
            // The user folded or unfolded it: the width of the map no longer decides
            foldChosen: false
        };
    },
    computed: {
        // A map narrower than `sm` starts with the panel folded, so no panel covers it on load (FR-MAP-12)
        narrow() {
            return !!this.mapSize?.narrow;
        },
        // What the rows show: the part of the name that tells the layers apart (the date), cut in the middle if still long (FR-RAS-12)
        labels() {
            return distinctLabels(this.layers.map(l => l.name || ''), LABEL_MAX);
        },
        repickable() {
            return this.canRepick === undefined ? this.removable : this.canRepick;
        },
        foldLabel() {
            return this.folded ? 'Unfold layers' : 'Fold layers';
        }
    },
    watch: {
        narrow: {
            immediate: true,
            handler(narrow) {
                if (!this.foldChosen) this.folded = narrow;
            }
        }
    },
    methods: {
        toggleFold() {
            this.foldChosen = true;
            this.folded = !this.folded;
        },
        /** What the row of a layer that is not drawn says; a build that runs says how far it is (the state is reactive) */
        placeholderText(layer) {
            const { text, progress } = layer.placeholder;
            const percent = typeof progress === 'function' ? progress() : null;
            return percent == null ? text : text.replace(/^Building/, `Building ${formatNumber(percent, 0)} %`);
        },
        isChanged(layer) {
            return this.changedPaths.includes(layer.path);
        },
        isRemovable(layer) {
            if (layer.removable !== undefined) return !!layer.removable;
            return this.removablePaths ? this.removablePaths.includes(layer.path) : this.removable;
        },
        onInput(layer, event) {
            const newOpacity = parseFloat(event.target.value);
            const updated = this.layers.map(l =>
                l.path === layer.path ? { ...l, opacity: newOpacity } : l
            );
            this.$emit('update:layers', updated);
        },
        onReorder(fromIndex, toIndex) {
            this.$emit('reorder', { fromIndex, toIndex });
        }
    }
};
</script>

<style scoped>
.raster-opacity-panel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    max-height: 50%;
    overflow-y: auto;
}

/* The header is for the fold toggle, which only a phone has */
.layers-header {
    display: none;
}

.fold-toggle {
    display: none;
}

.raster-opacity-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

/* One line above a phone: the halves dissolve into the row */
.row-head,
.row-controls {
    display: contents;
}

.raster-label {
    flex: 0 1 10rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
    font-size: var(--ddb-font-size-sm);
}

/* Text and an icon, not a colour: neutral, like the other controls of the panel */
.changed-badge {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 0.4rem;
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.4);
    border-radius: 0.6rem;
    background: rgba(var(--ddb-glass-rgb), 0.12);
    font-size: 0.65rem;
    line-height: 1.4;
}

.raster-opacity-row input[type="range"] {
    flex: 1;
    min-width: 4rem;
    cursor: pointer;
}

.placeholder-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-warning);
}

.row-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: rgba(var(--ddb-glass-rgb), 0.8);
    cursor: pointer;
    padding: 0.1rem 0.25rem;
    border-radius: 0.2rem;
    line-height: 1;

    &:hover {
        color: var(--ddb-text-on-dark);
        background: rgba(var(--ddb-glass-rgb), 0.15);
    }
}

/* A hidden layer: its name dims, the slider keeps its value */
.raster-opacity-row--hidden .raster-label {
    opacity: 0.45;
}

.add-layer {
    align-self: flex-start;
}

.order-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    flex-shrink: 0;
}

.order-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: rgba(var(--ddb-glass-rgb), 0.8);
    cursor: pointer;
    padding: 0.05rem 0.2rem;
    border-radius: 0.2rem;
    line-height: 1;
    font-size: 0.6rem;
    transition: color 0.15s, background 0.15s;
}

.order-btn:hover:not(:disabled) {
    color: var(--ddb-text-on-dark);
    background: rgba(var(--ddb-glass-rgb), 0.15);
}

.order-btn--hidden {
    display: none;
    pointer-events: none;
}

/* A tablet or a phone: the panel has a header with the fold toggle; folded, the header is all that
   shows (the rows are only hidden, so their settings stay) */
@media (max-width: 767.98px) {
    .layers-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .layers-title {
        font-weight: 600;
    }

    .fold-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: rgba(var(--ddb-glass-rgb), 0.8);
        cursor: pointer;
        padding: 0.1rem 0.25rem;
        border-radius: 0.2rem;
        line-height: 1;
    }

    .fold-toggle:hover {
        color: var(--ddb-text-on-dark);
        background: rgba(var(--ddb-glass-rgb), 0.15);
    }

    .raster-opacity-panel.is-folded > :not(.layers-header) {
        display: none;
    }
}

/* A phone: a row is two lines, the name and the eye, then the slider, its value and the actions of
   the row; nothing wraps further, the slider takes what the buttons leave */
@media (max-width: 575.98px) {
    .raster-opacity-row {
        flex-direction: column;
        align-items: stretch;
        gap: 0.1rem;
    }

    .row-head,
    .row-controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;
    }

    .raster-label {
        flex: 1 1 0;
        min-width: 4rem;
    }

    /* The badge gives way to the name, and loses its icon, before it wraps; its title has the full text */
    .changed-badge i {
        display: none;
    }

    .raster-opacity-row input[type="range"] {
        flex: 1 1 0;
        min-width: 2.5rem;
    }

    /* The text of the placeholder names the file, so the name is not repeated; the actions go to the right of line 2 */
    .raster-opacity-row--placeholder .raster-label {
        display: none;
    }

    .raster-opacity-row--placeholder .row-controls {
        justify-content: flex-end;
    }
}

/* Fingers: the two arrows side by side, each a touch target; the missing one keeps its place so
   the sliders line up */
@media (pointer: coarse) {
    .order-buttons {
        flex-direction: row;
        gap: 0;
    }

    .order-btn,
    .row-btn,
    .fold-toggle {
        min-width: 2rem;
        min-height: 2rem;
        font-size: 0.75rem;
    }

    .order-btn--hidden {
        display: flex;
        visibility: hidden;
    }
}
</style>
