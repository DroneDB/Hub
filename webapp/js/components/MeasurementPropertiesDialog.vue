<template>
    <Window :title="dialogTitle" id="measurement-properties" @onClose="cancel" modal fixedSize maxWidth="400px">
        <div class="measurement-properties-form">
            <div class="form-group">
                <label for="mp-name">Name</label>
                <input type="text" id="mp-name" v-model="formData.name" placeholder="Enter a name..." />
            </div>

            <div class="form-group">
                <label for="mp-description">Description</label>
                <textarea id="mp-description" v-model="formData.description" placeholder="Enter a description..." rows="3"></textarea>
            </div>

            <div class="form-group">
                <label>Stroke Color</label>
                <div class="color-palette">
                    <div
                        v-for="color in colorPalette"
                        :key="color"
                        class="color-swatch"
                        :class="{ selected: formData.stroke === color }"
                        :style="{ backgroundColor: color }"
                        @click="formData.stroke = color"
                    ></div>
                    <input
                        type="color"
                        v-model="formData.stroke"
                        class="color-picker-custom"
                        title="Custom color"
                    />
                </div>
            </div>

            <div class="form-group" v-if="showFill">
                <label>Fill Color</label>
                <div class="color-palette">
                    <div
                        v-for="color in colorPalette"
                        :key="'fill-' + color"
                        class="color-swatch"
                        :class="{ selected: formData.fill === color }"
                        :style="{ backgroundColor: color }"
                        @click="formData.fill = color"
                    ></div>
                    <input
                        type="color"
                        v-model="formData.fill"
                        class="color-picker-custom"
                        title="Custom color"
                    />
                </div>
            </div>

            <div class="form-group">
                <label for="mp-stroke-width">Stroke Width: {{ formData['stroke-width'] }}px</label>
                <input
                    type="range"
                    id="mp-stroke-width"
                    v-model.number="formData['stroke-width']"
                    min="1"
                    max="10"
                    step="1"
                />
            </div>

            <div class="form-group" v-if="showFill">
                <label for="mp-fill-opacity">Fill Opacity: {{ Math.round(formData['fill-opacity'] * 100) }}%</label>
                <input
                    type="range"
                    id="mp-fill-opacity"
                    v-model.number="formData['fill-opacity']"
                    min="0"
                    max="1"
                    step="0.1"
                />
            </div>

            <div class="buttons">
                <button class="btn-cancel" @click="cancel">Cancel</button>
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
        feature: {
            type: Object,
            required: true
        },
        geometryType: {
            type: String,
            default: 'LineString'
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
                name: '',
                description: '',
                stroke: '#ffcc33',
                'stroke-width': 2,
                'stroke-opacity': 1,
                fill: '#ffcc33',
                'fill-opacity': 0.2
            }
        };
    },
    computed: {
        dialogTitle() {
            return this.formData.name ? `Edit: ${this.formData.name}` : 'Measurement Properties';
        },
        showFill() {
            return this.geometryType === 'Polygon';
        }
    },
    mounted() {
        // Load existing properties from feature
        if (this.feature) {
            this.formData.name = this.feature.get('name') || '';
            this.formData.description = this.feature.get('description') || '';
            this.formData.stroke = this.feature.get('stroke') || '#ffcc33';
            this.formData['stroke-width'] = this.feature.get('stroke-width') || 2;
            this.formData['stroke-opacity'] = this.feature.get('stroke-opacity') || 1;
            this.formData.fill = this.feature.get('fill') || '#ffcc33';
            this.formData['fill-opacity'] = this.feature.get('fill-opacity') || 0.2;
        }
    },
    methods: {
        save() {
            this.$emit('onSave', { ...this.formData });
            this.$emit('onClose');
        },
        cancel() {
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>
.measurement-properties-form {
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

.form-group input[type="text"],
.form-group textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
}

.form-group textarea {
    resize: vertical;
}

.form-group input[type="range"] {
    width: 100%;
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

.btn-cancel {
    background-color: #e0e0e0;
    color: #333;
}

.btn-cancel:hover {
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
