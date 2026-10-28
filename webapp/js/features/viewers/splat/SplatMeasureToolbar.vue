<template>
    <div class="measure-toolbar">
        <div class="toolbar-buttons" role="toolbar" aria-label="Measure">
            <button v-for="tool in TOOLS" :key="tool.kind" :class="{ active: activeKind === tool.kind }" :title="tool.title"
                    :aria-label="tool.title" :aria-pressed="activeKind === tool.kind" @click="emit('measure', tool.kind)">
                <i :class="tool.icon" />
            </button>
            <button :disabled="count === 0" title="Clear measurements" aria-label="Clear measurements" @click="emit('clear')">
                <i class="fa-solid fa-trash" />
            </button>
            <button v-if="canSetScale" :class="{ active: activeKind === 'scale' }" title="Set the scale: pick two points on something of a known length"
                    aria-label="Set the scale" :aria-pressed="activeKind === 'scale'" @click="emit('measure', 'scale')">
                <i class="fa-solid fa-arrows-left-right-to-line" />
            </button>
        </div>
        <div v-if="activeKind" class="measure-hint">
            <span>{{ hint }}</span>
            <button class="hint-action" @click="emit('finish')">Done</button>
            <button class="hint-action" @click="emit('cancel')">Cancel</button>
        </div>
        <small v-else-if="!metric && count > 0" class="measure-hint scale-hint">
            Values are in the units of the file.<template v-if="canSetScale"> Set the scale to read metres.</template>
        </small>
    </div>
</template>

<script setup>
/**
 * The splat viewer's measurement toolbar (top-left): point, distance, height and area, clearing
 * them, and (for a user who can save it, on a scene with no scale) setting the scale. While a
 * shape is drawn it says how to end it, with buttons for a screen that has no right click or Enter.
 */
import { computed } from 'vue';

const props = defineProps({
    /** The kind being drawn or picked: 'point' | 'distance' | 'height' | 'area' | 'scale' | 'pin' | null */
    activeKind: { type: String, default: null },
    /** How many shapes are shown */
    count: { type: Number, default: 0 },
    /** The values are in metres (a georeferenced scene, or one with a scale) */
    metric: { type: Boolean, default: false },
    /** The scale can be set: the user can save it and the scene has none */
    canSetScale: { type: Boolean, default: false }
});
const emit = defineEmits(['measure', 'clear', 'finish', 'cancel']);

const TOOLS = [
    { kind: 'point', title: 'Measure a point', icon: 'fa-solid fa-location-dot' },
    { kind: 'distance', title: 'Measure a distance', icon: 'fa-solid fa-ruler' },
    { kind: 'height', title: 'Measure a height', icon: 'fa-solid fa-ruler-vertical' },
    { kind: 'area', title: 'Measure an area', icon: 'fa-solid fa-draw-polygon' }
];

const HINTS = {
    point: 'Click a point of the scene.',
    distance: 'Click the points of the line. Right click or Enter ends it, Escape cancels.',
    height: 'Click two points: the height is the difference along the scene\'s up.',
    area: 'Click the corners of the area (3 or more). Right click or Enter ends it, Escape cancels.',
    scale: 'Click the two ends of something whose length you know.',
    pin: 'Click where the pin goes.'
};
const hint = computed(() => HINTS[props.activeKind] ?? '');
</script>

<style scoped lang="scss">
@use '../../../../css/overlay-button' as *;

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
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    color: var(--ddb-text-on-dark);
}

.toolbar-buttons {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
}

.toolbar-buttons button {
    @include overlay-button(
        $size: 2.25rem,
        $radius: 4px,
        $background: transparent,
        $hover-background: rgba(255, 255, 255, 0.15),
        $active-background: var(--ddb-primary),
        $font-size: var(--ddb-font-size-base),
        $transition-time: 0.2s
    );
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
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: inherit;
    padding: 0.1rem 0.5rem;
    cursor: pointer;
}

.hint-action:hover {
    background: rgba(255, 255, 255, 0.15);
}
</style>
