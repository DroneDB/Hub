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
                <button v-if="removable && bands.length > 1" class="split-label-btn" title="Remove from comparison"
                        aria-label="Remove from comparison" @click="$emit('remove', i)">
                    <i class="fa-solid fa-xmark" />
                </button>
                <button v-if="i < bands.length - 1" class="split-label-btn" title="Move right" aria-label="Move right" @click="$emit('move', i, i + 1)">
                    <i class="fa-solid fa-caret-right" />
                </button>
            </span>
        </div>

        <!-- Draggable vertical handles (N-1) -->
        <div
            v-for="(pos, i) in positions"
            :key="'handle-' + i"
            class="split-handle"
            :style="{ left: (pos * 100) + '%' }"
            @pointerdown="startDrag($event, i)"
        >
            <div class="split-handle-bar" />
            <div class="split-handle-grip"><i class="fa-solid fa-grip-lines-vertical" /></div>
        </div>
    </div>
</template>

<script>
/**
 * RasterSplitOverlay - the labels and dividers of the split compare mode. A band label moves
 * its layer one band left or right (the band widths stay); with `removable` (a comparison) it
 * also removes it, and a missing layer's label picks another file.
 */
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
            const minGap = 0.05;
            const leftBound = this.draggingIndex === 0 ? minGap : this.positions[this.draggingIndex - 1] + minGap;
            const rightBound = this.draggingIndex === this.positions.length - 1 ? 1 - minGap : this.positions[this.draggingIndex + 1] - minGap;
            const clamped = Math.max(leftBound, Math.min(rightBound, newPos));

            const updated = [...this.positions];
            updated[this.draggingIndex] = clamped;
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
    z-index: 2;
    overflow: hidden;
}

.split-band-label {
    position: absolute;
    top: 0.6rem;
    pointer-events: none;
}

/* Only the buttons take clicks: the label itself may sit over the map's own buttons */
.split-label-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.65);
    color: var(--ddb-text-on-color);
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.55rem;
    border-radius: 1rem;
    white-space: nowrap;
    max-width: 18rem;
    user-select: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);

    &.placeholder {
        background: rgba(120, 60, 0, 0.8);
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

/* A phone: the labels go to the bottom, above the corner buttons, so they do not cover the
   zoom and tool buttons at the top */
@media (max-width: 575.98px) {
    .split-band-label {
        top: auto;
        bottom: 3.25rem;
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

.split-handle-bar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    pointer-events: none;
}

.split-handle-grip {
    position: relative;
    background: rgba(0, 0, 0, 0.6);
    color: var(--ddb-text-on-color);
    border-radius: 0.4rem;
    padding: 0.3rem 0.35rem;
    font-size: 0.75rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    user-select: none;
    pointer-events: none;
}
</style>
