<template>
    <div class="band-selector" role="group">
        <div v-for="ch in channels" :key="ch.id" class="band-channel">
            <label :for="uid + ch.id" class="channel-label" :class="`channel-label--${ch.id}`">{{ ch.label }}</label>
            <!-- The one field of the panels (css/_analysis-panel.scss), with the Hub's focus ring -->
            <select :id="uid + ch.id" v-model="selected[ch.id]" class="panel-select" @change="emitChange">
                <option v-for="b in bands" :key="b.index" :value="b.index">
                    {{ b.index }} - {{ b.name }}
                </option>
            </select>
        </div>
    </div>
</template>

<script>
/**
 * BandSelector - RGB channel-to-band selector for multispectral rasters.
 *
 * Binds three dropdowns (R, G, B) to band indices and emits an updated
 * "R:G:B" string via v-model.
 *
 * Props:
 *   modelValue - Current band mapping string (e.g. "1:2:3").
 *   bands      - Array of { index, name } band descriptors.
 */
import { useId } from 'vue';

export default {
    props: {
        modelValue: { type: String, default: '' },
        bands: { type: Array, default: () => [] }
    },
    emits: ['update:modelValue'],
    setup() {
        // Unique per instance: the selector can be on screen more than once
        return { uid: useId() + '-band-' };
    },
    data() {
        return {
            channels: [
                { id: 'r', label: 'R' },
                { id: 'g', label: 'G' },
                { id: 'b', label: 'B' }
            ],
            selected: { r: 1, g: 2, b: 3 }
        };
    },
    watch: {
        modelValue: {
            handler(val) {
                if (!val) {
                    this.selected = { r: 1, g: 2, b: 3 };
                    return;
                }
                const parts = val.split(',').map(Number);
                if (parts.length >= 3) {
                    this.selected = { r: parts[0], g: parts[1], b: parts[2] };
                }
            },
            immediate: true
        },
        bands: {
            handler(val) {
                if (!val || val.length === 0) return;
                if (!this.modelValue) {
                    // Set defaults based on band count
                    const n = val.length;
                    if (n >= 3) {
                        this.selected = { r: 1, g: 2, b: 3 };
                    }
                }
            },
            immediate: true
        }
    },
    methods: {
        emitChange() {
            const val = `${this.selected.r},${this.selected.g},${this.selected.b}`;
            this.$emit('update:modelValue', val);
        }
    }
};
</script>

<style scoped>
.band-selector {
    display: flex;
    gap: 0.25rem;
}

.band-channel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.channel-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
}

.channel-label--r { color: var(--panel-channel-r); }
.channel-label--g { color: var(--panel-channel-g); }
.channel-label--b { color: var(--panel-channel-b); }
</style>
