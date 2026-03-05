<template>
    <Window title="Point Annotation" id="point-annotation" @onClose="discard" modal fixedSize sizeClass="dialog-sm">
        <div class="point-annotation-form">
            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold">Color</label>
                <div class="color-palette">
                    <div
                        v-for="color in colorPalette"
                        :key="color"
                        class="color-swatch"
                        :class="{ selected: formData.color === color }"
                        :style="{ backgroundColor: color }"
                        @click="formData.color = color"
                    ></div>
                    <input
                        type="color"
                        v-model="formData.color"
                        class="color-picker-custom"
                        title="Custom color"
                    />
                </div>
            </div>

            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold" for="pa-description">Description</label>
                <Textarea id="pa-description" v-model="formData.description" placeholder="Enter a description..." rows="3" autoResize class="w-100" />
            </div>

            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button @click="discard" severity="secondary" label="Discard" />
                <Button @click="save" severity="primary" label="Save" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';

export default {
    components: {
        Window,
        Button,
        Textarea
    },
    props: {
        initialColor: {
            type: String,
            default: '#ffcc33'
        },
        initialDescription: {
            type: String,
            default: ''
        }
    },
    emits: ['onClose'],
    data() {
        return {
            colorPalette: [
                '#ffcc33', // Default yellow
                '#ff0000', // Red
                '#00ff00', // Green
                '#0000ff', // Blue
                '#ff6600', // Orange
                '#9900ff', // Purple
                '#00cccc', // Cyan
                '#333333'  // Dark gray
            ],
            formData: {
                color: this.initialColor,
                description: this.initialDescription
            }
        };
    },
    methods: {
        save() {
            this.$emit('onSave', { ...this.formData });
            this.$emit('onClose');
        },
        discard() {
            this.$emit('onDiscard');
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>
.point-annotation-form {
    padding: 1rem;
    min-width: 18.75rem;
}

.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
}

.color-swatch {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    border: var(--ddb-border-width) solid transparent;
    transition: border-color 0.2s, transform 0.1s;
}

.color-swatch:hover {
    transform: scale(1.1);
}

.color-swatch.selected {
    border-color: #000;
    box-shadow: 0 0 0 0.25rem #fff, 0 0 0 0.5rem #000;
}

.color-picker-custom {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
}
</style>
