<template>
    <div class="colormap-dropdown" ref="dropdownRef">
        <button class="colormap-trigger" @click="toggleOpen" type="button">
            <span class="colormap-preview" v-if="selectedItem" :style="gradientStyle(selectedItem.colors)"></span>
            <span class="colormap-label">{{ selectedItem ? selectedItem.name : 'Select...' }}</span>
            <i class="fas fa-chevron-down colormap-arrow"></i>
        </button>
        <div class="colormap-menu" v-if="open">
            <div v-for="cm in items" :key="cm.id"
                class="colormap-option"
                :class="{ selected: cm.id === modelValue }"
                @click="select(cm)">
                <span class="colormap-preview" :style="gradientStyle(cm.colors)"></span>
                <span class="colormap-label">{{ cm.name }}</span>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        modelValue: { type: String, default: '' },
        colormaps: { type: Array, default: () => [] }
    },
    emits: ['update:modelValue'],
    data() {
        return { open: false };
    },
    computed: {
        items() {
            return this.colormaps.map(cm =>
                typeof cm === 'string' ? { id: cm, name: cm, colors: [] } : cm
            );
        },
        selectedItem() {
            return this.items.find(cm => cm.id === this.modelValue) || null;
        }
    },
    methods: {
        toggleOpen() {
            this.open = !this.open;
        },
        select(cm) {
            this.open = false;
            this.$emit('update:modelValue', cm.id);
        },
        gradientStyle(colors) {
            if (!colors || colors.length === 0) return {};
            return { background: `linear-gradient(to right, ${colors.join(', ')})` };
        },
        onClickOutside(e) {
            if (this.$refs.dropdownRef && !this.$refs.dropdownRef.contains(e.target)) {
                this.open = false;
            }
        }
    },
    mounted() {
        document.addEventListener('click', this.onClickOutside);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.onClickOutside);
    }
};
</script>

<style scoped>
.colormap-dropdown {
    position: relative;
    width: 100%;
}

.colormap-trigger {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #eee;
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
}

.colormap-trigger:focus {
    outline: none;
    border-color: rgba(76, 175, 80, 0.6);
}

.colormap-arrow {
    margin-left: auto;
    font-size: 0.6rem;
    color: #aaa;
}

.colormap-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    background: #2a2a2a;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 0.25rem;
    margin-top: 2px;
    max-height: 12rem;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.colormap-option {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.4rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: #eee;
}

.colormap-option:hover {
    background: rgba(255,255,255,0.1);
}

.colormap-option.selected {
    background: rgba(76, 175, 80, 0.25);
}

.colormap-preview {
    display: inline-block;
    width: 3rem;
    min-width: 3rem;
    height: 0.7rem;
    border-radius: 2px;
}

.colormap-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
