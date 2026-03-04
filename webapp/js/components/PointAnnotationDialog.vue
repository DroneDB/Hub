<template>
    <Window title="Point Annotation" id="point-annotation" @onClose="discard" modal fixedSize maxWidth="400px">
        <div class="point-annotation-form">
            <div class="form-group">
                <label>Color</label>
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

            <div class="form-group">
                <label for="pa-description">Description</label>
                <textarea id="pa-description" v-model="formData.description" placeholder="Enter a description..." rows="3"></textarea>
            </div>

            <div class="buttons">
                <button class="btn-discard" @click="discard">Discard</button>
                <button class="btn-save" @click="save">Save</button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';

export default {
    components: {
        Window
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

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--ddb-text);
}

.form-group textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--ddb-border);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    box-sizing: border-box;
    resize: vertical;
}

.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
}

.color-swatch {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s, transform 0.1s;
}

.color-swatch:hover {
    transform: scale(1.1);
}

.color-swatch.selected {
    border-color: #000;
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px #000;
}

.color-picker-custom {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--ddb-border);
    border-radius: 0.25rem;
    cursor: pointer;
    background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
}

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--ddb-border-separator);
}

.buttons button {
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
}

.btn-discard {
    background-color: var(--ddb-border-separator);
    color: var(--ddb-text);
}

.btn-discard:hover {
    background-color: var(--ddb-border);
}

.btn-save {
    background-color: var(--ddb-success);
    color: var(--ddb-text-on-color);
}

.btn-save:hover {
    background-color: var(--ddb-success);
    filter: brightness(0.9);
}
</style>
