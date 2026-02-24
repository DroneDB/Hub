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
    padding: 16px;
    min-width: 300px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    margin-bottom: 4px;
    font-weight: 500;
    color: #333;
}

.form-group textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
    resize: vertical;
}

.color-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
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
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
}

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #eee;
}

.buttons button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    border: none;
}

.btn-discard {
    background-color: #e0e0e0;
    color: #333;
}

.btn-discard:hover {
    background-color: #d0d0d0;
}

.btn-save {
    background-color: #4CAF50;
    color: white;
}

.btn-save:hover {
    background-color: #45a049;
}
</style>
