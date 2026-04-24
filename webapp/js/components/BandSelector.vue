<template>
    <div class="band-selector">
        <div class="band-channel" v-for="ch in channels" :key="ch.id">
            <label class="channel-label" :style="{ color: ch.color }">{{ ch.label }}</label>
            <select v-model="selected[ch.id]" @change="emitChange" class="channel-select">
                <option v-for="b in bands" :key="b.index" :value="b.index">
                    {{ b.index }} — {{ b.name }}
                </option>
            </select>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        modelValue: { type: String, default: '' },
        bands: { type: Array, default: () => [] }
    },
    emits: ['update:modelValue'],
    data() {
        return {
            channels: [
                { id: 'r', label: 'R', color: '#ff6b6b' },
                { id: 'g', label: 'G', color: '#69db7c' },
                { id: 'b', label: 'B', color: '#74c0fc' }
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

.channel-select {
    width: 100%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #eee;
    border-radius: 0.25rem;
    padding: 0.2rem 0.15rem;
    font-size: 0.7rem;
}

.channel-select:focus {
    outline: none;
    border-color: rgba(76, 175, 80, 0.6);
}

.channel-select option {
    background: #2a2a2a;
    color: #eee;
}
</style>
