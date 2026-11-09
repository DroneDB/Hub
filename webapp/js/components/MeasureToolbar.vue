<template>
    <div class="measure-toolbar" :class="{ labelled: showLabels }" data-testid="measure-toolbar">
        <div class="toolbar-buttons" role="toolbar" aria-label="Measure">
            <button v-for="tool in shownTools" :key="tool.kind" type="button" :class="{ active: activeKind === tool.kind }" :title="tool.title"
                    :aria-label="tool.title" :aria-pressed="activeKind === tool.kind" :data-testid="`measure-${tool.kind}`" @click="emit('measure', tool.kind)">
                <i :class="tool.icon" />
                <span v-if="showLabels" class="tool-label">{{ tool.label }}</span>
            </button>
            <button v-if="showClear" type="button" :disabled="!canClear" title="Clear measurements" aria-label="Clear measurements" data-testid="measure-clear"
                    @click="emit('clear')">
                <i class="fa-solid fa-trash" />
                <span v-if="showLabels" class="tool-label">Clear</span>
            </button>
            <button v-if="canSetScale" type="button" :class="{ active: activeKind === 'scale' }" title="Set the scale: pick two points on something of a known length"
                    aria-label="Set the scale" :aria-pressed="activeKind === 'scale'" @click="emit('measure', 'scale')">
                <i class="fa-solid fa-arrows-left-right-to-line" />
            </button>
            <button v-if="coordinateMode" type="button" class="coordinate-mode" :title="`Coordinates are shown in ${coordinateMode}: click to change`"
                    :aria-label="`Coordinates are shown in ${coordinateMode}: click to change`" @click="emit('toggle-coordinates')">
                {{ coordinateMode }}
            </button>
            <!-- What a viewer adds to the tools: the point cloud's clip volume, views, colours -->
            <slot name="extra" />
        </div>
        <div v-if="activeKind" class="measure-hint" role="status" data-testid="measure-hint">
            <span>{{ hint }}</span>
            <button type="button" class="hint-action" data-testid="measure-done" @click="emit('finish')">Done</button>
            <button type="button" class="hint-action" data-testid="measure-cancel" @click="emit('cancel')">Cancel</button>
        </div>
        <small v-else-if="!metric && count > 0" class="measure-hint scale-hint">
            Values are in the units of the file.<template v-if="canSetScale"> Set the scale to read metres.</template>
        </small>
    </div>
</template>

<script setup>
/**
 * The measurement toolbar of the 3D, splat and point-cloud viewers (FR-XC-17, D-027): the tools it is
 * given (point, distance, height, area), Clear, and (for a user who can save it, on a scene with no scale)
 * setting the scale. A georeferenced scene also has a button for the coordinates of a point: in its CRS or in
 * WGS84. While a shape is drawn it says how to end it (the one hint text of libs/measureHints), with Done and
 * Cancel for a screen that has no right click, Enter or Escape. Clear is on while a shape is drawn, and
 * cancels it. A viewer puts its own tools in the `extra` slot, after the measuring ones. With `labelled` the tools
 * show their name beside the icon (a button keeps its aria-label either way); below sm (useStackedLayout, a phone)
 * they are icons again, so the toolbar does not cover the view.
 */
import { computed } from 'vue';
import { drawingHint } from '@/libs/measureHints';
import { useStackedLayout } from '@/composables/useStackedLayout';

const ALL_TOOLS = [
    { kind: 'point', label: 'Point', title: 'Measure a point', icon: 'fa-solid fa-location-dot' },
    { kind: 'distance', label: 'Distance', title: 'Measure a distance', icon: 'fa-solid fa-ruler' },
    { kind: 'height', label: 'Height', title: 'Measure a height', icon: 'fa-solid fa-ruler-vertical' },
    { kind: 'area', label: 'Area', title: 'Measure an area', icon: 'fa-solid fa-draw-polygon' }
];

const props = defineProps({
    /** The kind being drawn or picked: 'point' | 'distance' | 'height' | 'area' | 'scale' | 'pin' | 'other' (a measure with no button) | null */
    activeKind: { type: String, default: null },
    /** The tools offered, in this order: any of 'point', 'distance', 'height', 'area' */
    kinds: { type: Array, default: () => ['point', 'distance', 'height', 'area'] },
    /** How many shapes are shown */
    count: { type: Number, default: 0 },
    /** The values are in metres (a georeferenced scene, or one with a scale) */
    metric: { type: Boolean, default: true },
    /** The scale can be set: the user can save it and the scene has none */
    canSetScale: { type: Boolean, default: false },
    /** What the coordinates of a point are shown in ("EPSG:32632", "WGS84"), empty when the scene has no choice to offer */
    coordinateMode: { type: String, default: '' },
    /** Whether the toolbar has a Clear button (the point-cloud viewer has its own delete tool and Delete saved) */
    showClear: { type: Boolean, default: true },
    /** The tools say their name beside the icon (the point-cloud viewer's panel), except below sm; a tool of the `extra` slot does the same by its own markup */
    labelled: { type: Boolean, default: false }
});
const emit = defineEmits(['measure', 'clear', 'finish', 'cancel', 'toggle-coordinates']);

// Names beside the icons, but not on a phone
const compact = useStackedLayout();
const showLabels = computed(() => props.labelled && !compact.value);

const shownTools = computed(() => props.kinds.map(kind => ALL_TOOLS.find(t => t.kind === kind)).filter(Boolean));
// Clear takes the shapes and the one being drawn
const canClear = computed(() => props.count > 0 || !!props.activeKind);

const HINTS = {
    point: drawingHint('point'),
    distance: drawingHint('line'),
    height: drawingHint('height'),
    area: drawingHint('area'),
    // A measure of a kind the toolbar has no button for (the point cloud's angle, circle, azimuth from its own menu)
    other: drawingHint('measure'),
    scale: 'Click the two ends of something whose length you know. Esc cancels.',
    pin: 'Click where the pin goes. Esc cancels.'
};
const hint = computed(() => HINTS[props.activeKind] ?? '');
</script>

<style scoped lang="scss">
@use '../../css/overlay-button' as *;

.measure-toolbar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    pointer-events: none;
}

.toolbar-buttons,
.measure-hint {
    pointer-events: auto;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    color: var(--ddb-text-on-dark);
}

.toolbar-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
}

.toolbar-buttons :deep(button) {
    @include toolbar-button;
}

// Tools with their name: as wide as the name, with the icon before it
.labelled .toolbar-buttons :deep(button) {
    width: auto;
    padding: 0 0.6rem;
    gap: 0.4rem;
    white-space: nowrap;
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

.toolbar-buttons .coordinate-mode {
    width: auto;
    padding: 0 0.5rem;
    font-size: var(--ddb-font-size-sm, 0.8rem);
    white-space: nowrap;
}

.measure-hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    max-width: 22rem;
    padding: 0.3rem 0.5rem;
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

.hint-action {
    border: 1px solid rgba(var(--ddb-glass-rgb), 0.35);
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: inherit;
    padding: 0.1rem 0.5rem;
    cursor: pointer;
}

.hint-action:hover {
    background: rgba(var(--ddb-glass-rgb), 0.15);
}
</style>
