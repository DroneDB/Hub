<template>
    <Window id="measurement-properties" :title="dialogTitle" modal fixed-size size-class="dialog-sm" @close="cancel" @confirm="save">
        <div class="measurement-properties-form">
            <div class="form-group">
                <label for="mp-name">Name</label>
                <input id="mp-name" v-model="formData.name" type="text" placeholder="Enter a name...">
            </div>

            <div class="form-group">
                <label for="mp-description">Description</label>
                <textarea id="mp-description" v-model="formData.description" placeholder="Enter a description..." rows="3" />
            </div>

            <div class="form-group">
                <label for="mp-stroke">Stroke Color</label>
                <ColorSwatchPicker v-model="formData.stroke" input-id="mp-stroke" label="Stroke color" />
            </div>

            <div v-if="showFill" class="form-group">
                <label for="mp-fill">Fill Color</label>
                <ColorSwatchPicker v-model="formData.fill" input-id="mp-fill" label="Fill color" />
            </div>

            <div class="form-group">
                <label for="mp-stroke-width">Stroke Width: {{ formData['stroke-width'] }}px</label>
                <input
                    id="mp-stroke-width"
                    v-model.number="formData['stroke-width']"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                >
            </div>

            <div v-if="showFill" class="form-group">
                <label for="mp-fill-opacity">Fill Opacity: {{ Math.round(formData['fill-opacity'] * 100) }}%</label>
                <input
                    id="mp-fill-opacity"
                    v-model.number="formData['fill-opacity']"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                >
            </div>

            <div v-if="isPoint" class="form-group">
                <span id="mp-coords" class="form-label">Coordinates</span>
                <div class="coords-row" role="group" aria-labelledby="mp-coords">
                    <code class="coords-text">{{ coordsText }}</code>
                    <button type="button" class="btn-copy-coords" :title="copyTooltip" :aria-label="copyTooltip" @click="copyCoordinates">
                        <i :class="copyIconClass" />
                    </button>
                </div>
            </div>

            <div v-if="groups && groups.length > 0" class="form-group">
                <label for="mp-group">Group</label>
                <select id="mp-group" v-model="formData.groupId" class="group-dropdown">
                    <option value="">None (Ungrouped)</option>
                    <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                </select>
            </div>

        </div>

        <template #footer>
            <Button v-if="showDelete" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    title="Delete this measurement" @click="deleteMeasurement" />
            <Button label="Cancel" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm @click="save" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import { toLonLat } from 'ol/proj';
import { useCopyText } from '@/composables/useCopyText';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';

export default {
    components: {
        Window, Button,
        ColorSwatchPicker
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
        // When true the dialog renders a Delete button that emits delete.
        // Used by the non-edit-mode double-click flow which doubles as a
        // "detail" dialog with the option to remove the measurement.
        showDelete: {
            type: Boolean,
            default: false
        },
        // Available groups for the group assignment dropdown
        groups: {
            type: Array,
            default: () => []
        }
    },
    emits: ['close', 'save', 'delete'],
    setup() {
        const { copy: copyText, copied: coordsCopied } = useCopyText({ resetMs: 1500 });
        return { copyText, coordsCopied };
    },
    data() {
        return {
            formData: {
                name: '',
                description: '',
                stroke: MEASURE_COLOR,
                'stroke-width': 2,
                'stroke-opacity': 1,
                fill: MEASURE_COLOR,
                'fill-opacity': 0.2,
                groupId: ''
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
            } catch {
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
            this.formData.stroke = get('stroke') || MEASURE_COLOR;
            this.formData['stroke-width'] = get('stroke-width') !== undefined ? get('stroke-width') : 2;
            this.formData['stroke-opacity'] = get('stroke-opacity') !== undefined ? get('stroke-opacity') : 1;
            this.formData.fill = get('fill') || MEASURE_COLOR;
            this.formData['fill-opacity'] = get('fill-opacity') !== undefined ? get('fill-opacity') : 0.2;
            this.formData.groupId = get('groupId') || '';
        }
    },
    methods: {
        save() {
            this.$emit('save', { ...this.formData });
            this.$emit('close');
        },
        deleteMeasurement() {
            this.$emit('delete');
            this.$emit('close');
        },
        cancel() {
            this.$emit('close');
        },
        copyCoordinates() {
            const text = this.coordsText;
            if (!text) return;
            this.copyText(text);
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

.form-group label,
.form-group .form-label {
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

.coords-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background-color: var(--ddb-bg-subtle);
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

.group-dropdown {
    width: 100%;
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    font-size: var(--ddb-font-size-base);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    cursor: pointer;
    box-sizing: border-box;
}
</style>
