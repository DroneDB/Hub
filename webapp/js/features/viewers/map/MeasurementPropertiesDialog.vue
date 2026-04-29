<template>
    <Window :title="dialogTitle" id="measurement-properties" @onClose="cancel" modal fixedSize sizeClass="dialog-sm">
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

            <div v-if="isPoint" class="form-group">
                <label>Coordinates</label>
                <div class="coords-row">
                    <code class="coords-text">{{ coordsText }}</code>
                    <button type="button" class="btn-copy-coords" @click="copyCoordinates" :title="copyTooltip">
                        <i :class="copyIconClass"></i>
                    </button>
                </div>
            </div>

            <div class="buttons">
                <button v-if="showDelete" class="btn-delete" @click="deleteMeasurement" title="Delete this measurement">
                    <i class="fa-solid fa-trash"></i>
                    Delete
                </button>
                <button class="btn-cancel" @click="cancel">Cancel</button>
                <button class="btn-save" @click="save">Save</button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import { toLonLat } from 'ol/proj';

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
        },
        // When true the dialog renders a Delete button that emits onDelete.
        // Used by the non-edit-mode double-click flow which doubles as a
        // "detail" dialog with the option to remove the measurement.
        showDelete: {
            type: Boolean,
            default: false
        }
    },
    emits: ['onClose', 'onSave', 'onDelete'],
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
            coordsCopied: false,
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
        },
        isPoint() {
            return this.geometryType === 'Point';
        },
        pointCoordinates() {
            if (!this.isPoint || !this.feature) return null;
            const geom = this.feature.getGeometry && this.feature.getGeometry();
            if (!geom) return null;
            // Try to get lon/lat (WGS84). The geometry coords are in map
            // projection; rely on the feature's stored 'coordinates' meta
            // when available, otherwise convert via toLonLat dynamically.
            try {
                const c = geom.getCoordinates();
                const [lon, lat] = toLonLat(c);
                return { lon, lat };
            } catch (e) {
                return null;
            }
        },
        coordsText() {
            const c = this.pointCoordinates;
            if (!c) return '';
            return `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`;
        },
        copyIconClass() {
            return this.coordsCopied ? 'fa-solid fa-check' : 'fa-regular fa-copy';
        },
        copyTooltip() {
            return this.coordsCopied ? 'Copied!' : 'Copy coordinates';
        }
    },
    mounted() {
        // Load existing properties from feature. Use `!== undefined` checks for
        // numeric properties so a legitimate `0` value is preserved (would be
        // overridden by the `||` fallback otherwise).
        if (this.feature) {
            const get = (k) => this.feature.get(k);
            this.formData.name = get('name') || '';
            this.formData.description = get('description') || '';
            this.formData.stroke = get('stroke') || '#ffcc33';
            this.formData['stroke-width'] = get('stroke-width') !== undefined ? get('stroke-width') : 2;
            this.formData['stroke-opacity'] = get('stroke-opacity') !== undefined ? get('stroke-opacity') : 1;
            this.formData.fill = get('fill') || '#ffcc33';
            this.formData['fill-opacity'] = get('fill-opacity') !== undefined ? get('fill-opacity') : 0.2;
        }
    },
    methods: {
        save() {
            this.$emit('onSave', { ...this.formData });
            this.$emit('onClose');
        },
        deleteMeasurement() {
            this.$emit('onDelete');
            this.$emit('onClose');
        },
        cancel() {
            this.$emit('onClose');
        },
        copyCoordinates() {
            const text = this.coordsText;
            if (!text) return;
            const done = () => {
                this.coordsCopied = true;
                setTimeout(() => { this.coordsCopied = false; }, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => { /* noop */ });
            } else {
                // Legacy fallback
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    done();
                } catch (e) { /* noop */ }
            }
        }
    }
};
</script>

<style scoped>
.measurement-properties-form {
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

.form-group input[type="text"],
.form-group textarea {
    width: 100%;
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    font-size: var(--ddb-font-size-base);
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
    gap: var(--ddb-spacing-xs);
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

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--ddb-spacing-sm);
    margin-top: 1.25rem;
    padding-top: var(--ddb-spacing-lg);
    border-top: var(--ddb-border-width) solid var(--ddb-border-separator);
}

.buttons button {
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
    border-radius: var(--ddb-radius-sm);
    font-size: var(--ddb-font-size-base);
    cursor: pointer;
    border: none;
}

.btn-cancel {
    background-color: var(--ddb-border-separator);
    color: var(--ddb-text);
}

.btn-cancel:hover {
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

.btn-delete {
    background-color: var(--ddb-danger);
    color: var(--ddb-text-on-color);
    margin-right: auto;
}

.btn-delete:hover {
    background-color: var(--ddb-danger);
    filter: brightness(0.9);
}

.coords-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background-color: var(--ddb-background-soft, rgba(0, 0, 0, 0.03));
}

.coords-text {
    flex: 1;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text);
    word-break: break-all;
}

.btn-copy-coords {
    background: transparent;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    color: var(--ddb-text);
    transition: background-color 0.15s ease;
}

.btn-copy-coords:hover {
    background-color: var(--ddb-border-separator);
}
</style>
