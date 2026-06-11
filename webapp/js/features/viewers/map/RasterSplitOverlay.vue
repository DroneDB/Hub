<template>
    <div class="split-overlay" ref="overlay">
        <!-- Per-band top label -->
        <div
            v-for="(band, i) in bands"
            :key="'band-' + i"
            class="split-band-label"
            :style="bandLabelStyle(i)"
        >
            <span class="split-label-pill">{{ band }}</span>
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
export default {
    name: 'RasterSplitOverlay',
    props: {
        bands: {
            type: Array,
            required: true
        },
        positions: {
            type: Array,
            required: true
        }
    },
    emits: ['update:positions'],
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

.split-label-pill {
    display: inline-block;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.55rem;
    border-radius: 1rem;
    white-space: nowrap;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
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
    color: #fff;
    border-radius: 0.4rem;
    padding: 0.3rem 0.35rem;
    font-size: 0.75rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    user-select: none;
    pointer-events: none;
}
</style>
