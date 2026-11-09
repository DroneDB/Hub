<template>
    <div ref="overlay" class="split-overlay">
        <!-- Per-band top label, with the controls of its layer -->
        <div
            v-for="(band, i) in bands"
            :key="'band-' + i"
            class="split-band-label"
            :style="bandLabelStyle(i)"
        >
            <span class="split-label-pill" :class="{ placeholder: !!band.placeholder }">
                <button v-if="i > 0" class="split-label-btn" title="Move left" aria-label="Move left" @click="$emit('move', i, i - 1)">
                    <i class="fa-solid fa-caret-left" />
                </button>
                <span class="split-label-text" :title="band.placeholder ? band.placeholder.text : band.name">
                    {{ band.placeholder ? band.placeholder.text : band.name }}
                </span>
                <button v-if="removable && band.placeholder && band.placeholder.kind === 'missing'" class="split-label-btn"
                        title="Pick another raster" aria-label="Pick another raster" @click="$emit('repick', i)">
                    <i class="fa-solid fa-arrows-rotate" />
                </button>
                <button v-if="removable && bands.length > 1" class="split-label-btn" title="Remove layer"
                        aria-label="Remove layer" @click="$emit('remove', i)">
                    <i class="fa-solid fa-xmark" />
                </button>
                <button v-if="i < bands.length - 1" class="split-label-btn" title="Move right" aria-label="Move right" @click="$emit('move', i, i + 1)">
                    <i class="fa-solid fa-caret-right" />
                </button>
            </span>
        </div>

        <!-- Vertical dividers (N-1): dragged with a pointer, moved with the arrow keys, Home and End (FR-MAP-17) -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- a focusable separator is a widget: it has its role, its value and its arrow keys -->
        <div
            v-for="(pos, i) in positions"
            :key="'handle-' + i"
            class="split-handle"
            role="separator"
            aria-orientation="vertical"
            tabindex="0"
            :aria-label="handleLabel(i)"
            :aria-valuenow="percent(pos)"
            aria-valuemin="0"
            aria-valuemax="100"
            :style="{ left: (pos * 100) + '%' }"
            @pointerdown="startDrag($event, i)"
            @keydown="onHandleKey($event, i)"
        >
            <div class="split-handle-bar" />
            <div class="split-handle-grip"><i class="fa-solid fa-grip-lines-vertical" /></div>
        </div>
    </div>
</template>

<script>
/**
 * RasterSplitOverlay - the labels and dividers of the split mode. A band label moves its layer
 * one band left or right (the band widths stay); with `removable` (the map viewer, not Viewer
 * only) it also removes it, and a missing layer's label picks another file. A divider is a
 * separator that a pointer drags and the keyboard moves: ArrowLeft and ArrowRight by 5 % (Shift:
 * 1 %), Home and End to the end of its range; it never comes closer than 5 % to its neighbours.
 */

// The least width of a band, as a fraction of the map
const MIN_GAP = 0.05;
// A key press moves a divider by this much, and by the fine step with Shift
const STEP = 0.05;
const FINE_STEP = 0.01;
export default {
    name: 'RasterSplitOverlay',
    props: {
        // [{ name, placeholder: { kind, text } | null }], leftmost first
        bands: {
            type: Array,
            required: true
        },
        positions: {
            type: Array,
            required: true
        },
        removable: {
            type: Boolean,
            default: false
        }
    },
    emits: ['update:positions', 'move', 'remove', 'repick'],
    data() {
        return {
            draggingIndex: -1,
            dragStartX: 0,
            dragStartPos: 0,
        };
    },
    methods: {
        bandLabelStyle(i) {
            // Band i occupies [leftBound, rightBound] as percentages
            const leftBound = i === 0 ? 0 : this.positions[i - 1];
            const rightBound = i === this.positions.length ? 1 : this.positions[i];
            const center = (leftBound + rightBound) / 2;
            return {
                left: (center * 100) + '%',
                transform: 'translateX(-50%)',
            };
        },

        /** The divider as a whole percent, for the value a screen reader says */
        percent(position) {
            return Math.round(position * 100);
        },

        /** The name of divider i: the two bands it parts */
        handleLabel(i) {
            const name = j => {
                const band = this.bands[j];
                return band ? (band.placeholder ? band.placeholder.text : band.name) : `band ${j + 1}`;
            };
            return `Divider between ${name(i)} and ${name(i + 1)}`;
        },

        /** Where divider `index` may go: not closer than MIN_GAP to the edge of the map or to its neighbour. */
        clamp(index, value) {
            const low = index === 0 ? MIN_GAP : this.positions[index - 1] + MIN_GAP;
            const high = index === this.positions.length - 1 ? 1 - MIN_GAP : this.positions[index + 1] - MIN_GAP;
            return Math.max(low, Math.min(high, value));
        },

        move(index, value) {
            const updated = [...this.positions];
            updated[index] = this.clamp(index, value);
            if (updated[index] !== this.positions[index]) this.$emit('update:positions', updated);
        },

        onHandleKey(event, index) {
            const step = event.shiftKey ? FINE_STEP : STEP;
            const current = this.positions[index];
            let target;
            if (event.key === 'ArrowLeft') target = current - step;
            else if (event.key === 'ArrowRight') target = current + step;
            else if (event.key === 'Home') target = 0;
            else if (event.key === 'End') target = 1;
            else return;
            event.preventDefault();
            this.move(index, target);
        },

        startDrag(event, index) {
            event.preventDefault();
            this.draggingIndex = index;
            this.dragStartX = event.clientX;
            this.dragStartPos = this.positions[index];
            event.target.setPointerCapture(event.pointerId);
            event.target.addEventListener('pointermove', this.onPointerMove);
            event.target.addEventListener('pointerup', this.stopDrag);
            event.target.addEventListener('pointercancel', this.stopDrag);
        },

        onPointerMove(event) {
            if (this.draggingIndex < 0) return;
            const overlay = this.$refs.overlay;
            if (!overlay) return;
            const rect = overlay.getBoundingClientRect();
            const newPos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

            // Clamp so handles don't cross each other (minimum 5% gap)
            const updated = [...this.positions];
            updated[this.draggingIndex] = this.clamp(this.draggingIndex, newPos);
            this.$emit('update:positions', updated);
        },

        stopDrag(event) {
            event.target.releasePointerCapture(event.pointerId);
            event.target.removeEventListener('pointermove', this.onPointerMove);
            event.target.removeEventListener('pointerup', this.stopDrag);
            event.target.removeEventListener('pointercancel', this.stopDrag);
            this.draggingIndex = -1;
        }
    }
};
</script>

<style scoped>
.split-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* Under the map's controls (ol-controls.css), so a divider under the toolbar leaves it its clicks */
    z-index: var(--map-layer-split);
    overflow: hidden;
}

/* Below the zoom control at the top left, and so below the row of buttons at the top centre of the
   map: the label of a band is under neither */
.split-band-label {
    position: absolute;
    top: var(--map-zoom-reserve);
    pointer-events: none;
}

/* Only the buttons take clicks: the label itself lets them through to the map */
.split-label-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(var(--ddb-shade-rgb), 0.65);
    color: var(--ddb-text-on-dark);
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.55rem;
    border-radius: 1rem;
    white-space: nowrap;
    max-width: 18rem;
    user-select: none;
    box-shadow: 0 1px 4px rgba(var(--ddb-shade-rgb), 0.35);

    /* A missing or unavailable file: the Hub's warning look, yellow with dark text */
    &.placeholder {
        background: var(--ddb-warning);
        color: var(--ddb-text-on-warning);
    }
}

.split-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.split-label-btn {
    flex-shrink: 0;
    pointer-events: auto;
    background: none;
    border: none;
    color: inherit;
    padding: 0 0.15rem;
    cursor: pointer;
    line-height: 1;
    font-size: 0.75rem;
    opacity: 0.8;

    &:hover {
        opacity: 1;
    }
}

/* A phone: the labels go to the bottom, above the map settings button by the measure the panels
   keep from it, so they stay clear of the zoom and tool buttons at the top */
@media (max-width: 575.98px) {
    .split-band-label {
        top: auto;
        bottom: var(--map-bottom-reserve);
    }

    .split-label-pill {
        max-width: 45vw;
    }
}

/* Fingers: each control a touch target */
@media (pointer: coarse) {
    .split-label-btn {
        min-width: 1.75rem;
        min-height: 1.75rem;
    }
}

.split-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2rem;
    margin-left: -1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    pointer-events: all;
    z-index: 3;
}

.split-handle:focus-visible {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: calc(-1 * var(--ddb-focus-ring-width));
}

.split-handle-bar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: rgba(var(--ddb-glass-rgb), 0.85);
    box-shadow: 0 0 4px rgba(var(--ddb-shade-rgb), 0.5);
    pointer-events: none;
}

.split-handle-grip {
    position: relative;
    background: rgba(var(--ddb-shade-rgb), 0.6);
    color: var(--ddb-text-on-dark);
    border-radius: 0.4rem;
    padding: 0.3rem 0.35rem;
    font-size: 0.75rem;
    box-shadow: 0 1px 4px rgba(var(--ddb-shade-rgb), 0.4);
    user-select: none;
    pointer-events: none;
}
</style>
