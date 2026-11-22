<template>
    <Window id="measurement-properties" :title="dialogTitle" modal fixed-size size-class="dialog-sm" @close="cancel" @confirm="save">
        <div class="measurement-properties-form">
            <div class="mb-3">
                <label for="mp-name" class="d-block mb-1 fw-semibold">Name</label>
                <InputText id="mp-name" v-model="formData.name" placeholder="Optional" autocomplete="off" class="w-100" />
            </div>

            <div class="mb-3">
                <label for="mp-description" class="d-block mb-1 fw-semibold">Description</label>
                <Textarea id="mp-description" v-model="formData.description" placeholder="Optional" rows="3" :maxlength="FIELD_LIMITS.description" auto-resize class="w-100" />
            </div>

            <div class="mb-3">
                <label for="mp-stroke" class="d-block mb-1 fw-semibold">{{ colorLabel }}</label>
                <ColorSwatchPicker v-model="formData.stroke" input-id="mp-stroke" :label="colorLabel" />
            </div>

            <div v-if="isPolygon" class="mb-3">
                <label for="mp-fill" class="d-block mb-1 fw-semibold">Fill color</label>
                <ColorSwatchPicker v-model="formData.fill" input-id="mp-fill" label="Fill color" />
            </div>

            <div v-if="!isPoint" class="mb-3">
                <label for="mp-stroke-width" class="d-block mb-1 fw-semibold">{{ widthLabel }}: {{ formData['stroke-width'] }} px</label>
                <input id="mp-stroke-width" v-model.number="formData['stroke-width']" type="range" min="1" max="10" step="1" class="w-100">
            </div>

            <div v-if="isPolygon" class="mb-3">
                <label for="mp-fill-opacity" class="d-block mb-1 fw-semibold">Fill opacity: {{ Math.round(formData['fill-opacity'] * 100) }}%</label>
                <input id="mp-fill-opacity" v-model.number="formData['fill-opacity']" type="range" min="0" max="1" step="0.1" class="w-100">
            </div>

            <div v-if="isPoint" class="mb-3">
                <label for="mp-coords" class="d-block mb-1 fw-semibold">Coordinates</label>
                <div class="coords-field">
                    <InputText id="mp-coords" v-model="coordsInput" autocomplete="off" spellcheck="false" class="coords-input"
                               :invalid="!!located.error" :aria-invalid="located.error ? 'true' : undefined"
                               :aria-describedby="located.error ? 'mp-coords-error' : 'mp-coords-help'" />
                    <Button type="button" severity="secondary" text :icon="coordsCopied ? 'fa-solid fa-check' : 'fa-regular fa-copy'"
                            :title="coordsCopied ? 'Copied!' : 'Copy coordinates'" :aria-label="coordsCopied ? 'Copied!' : 'Copy coordinates'"
                            :disabled="!!located.error" @click="copyCoords(latLonText(located.lat, located.lon))" />
                </div>
                <FieldError id="mp-coords-error" :message="located.error" />
                <small v-if="!located.error" id="mp-coords-help" class="d-block mt-1 coords-help">
                    Latitude, longitude. {{ latLonDmsText(located.lat, located.lon) }}
                </small>
            </div>

            <div v-if="groups.length > 0" class="mb-3">
                <label id="mp-group-label" for="mp-group" class="d-block mb-1 fw-semibold">Group</label>
                <Select v-model="formData.groupId" input-id="mp-group" aria-labelledby="mp-group-label" :options="groupOptions"
                        option-label="label" option-value="value" class="w-100" />
            </div>

            <AnnotationFields v-model="fields" id-prefix="mp" class="mb-3" :schema="schema" :is-ref-taken="isRefTaken" @update:valid="fieldsValid = $event" />
        </div>

        <template #footer>
            <Button v-if="showDelete && !isNew" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    :title="`Delete this ${isPoint ? 'annotation' : 'measurement'}`" @click="deleteMeasurement" />
            <Button :label="isNew ? 'Discard' : 'Cancel'" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm :disabled="!!located.error || !fieldsValid" @click="save" />
        </template>
    </Window>
</template>

<script>
/**
 * The properties of a measurement or a point annotation: its name, description and colours, the width of a line,
 * the fill of an area, the coordinates of a point (typed or pasted to move it: decimal degrees or DMS, see
 * parseLatLon), its group and the annotation fields (AnnotationFields: reference, category, severity, status, assignee,
 * due date, in reports). The one dialog of a measurement, however it is
 * opened (a double click, the edit button of a point's callout, the measurement list, a point just placed).
 *
 * Emits `save` with the properties that apply to the geometry (a point has no width or fill; `coordinates`, its new
 * [longitude, latitude], only when they were changed; the annotation fields as they are stored, a field with no value
 * as undefined so that it is cleared, the `ref` only when there is one), `delete` from the
 * Delete button, and `discard` when a new point (`isNew`) is not kept: Discard, the close button or Esc.
 */
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import FieldError from '@/components/FieldError.vue';
import AnnotationFields from '@/components/measurements/AnnotationFields.vue';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { FIELD_KEYS, FIELD_LIMITS, storedFields } from '@/libs/map/annotationIds';
import { toLonLat } from 'ol/proj';
import { latLonText, latLonDmsText, parseLatLon } from '@/libs/format';
import { useCopyText } from '@/composables/useCopyText';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';

export default {
    components: {
        Window, Button, InputText, Textarea, Select,
        ColorSwatchPicker, FieldError, AnnotationFields
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
        // A Delete button that emits delete (a measurement that exists; a new point has Discard instead)
        showDelete: {
            type: Boolean,
            default: false
        },
        // A point just placed: Discard (or closing the dialog) removes it
        isNew: {
            type: Boolean,
            default: false
        },
        // The groups a measurement can be assigned to
        groups: {
            type: Array,
            default: () => []
        },
        // The organization's annotation schema: the categories, severities and statuses to choose from
        schema: {
            type: Object,
            default: () => DEFAULT_SCHEMA
        },
        // Says whether another annotation of the file has a reference (the one edited does not count)
        isRefTaken: {
            type: Function,
            default: () => false
        }
    },
    emits: ['close', 'save', 'delete', 'discard'],
    setup() {
        const { copy: copyCoords, copied: coordsCopied } = useCopyText({ resetMs: 1500 });
        return { copyCoords, coordsCopied, FIELD_LIMITS };
    },
    data() {
        return {
            // The coordinates of a point as the field shows them: "latitude, longitude"
            coordsInput: '',
            // Set once Save or Delete is chosen: the close that follows is not a discard
            done: false,
            // The annotation fields (reference, category, ...) and whether they can be saved
            fields: {},
            fieldsValid: true,
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
        isPoint() {
            return this.geometryType === 'Point';
        },
        isPolygon() {
            return this.geometryType === 'Polygon';
        },
        // A title that names what is edited: the name has its own field, the title does not change as it is typed
        dialogTitle() {
            if (this.isPoint) return this.isNew ? 'New Point Annotation' : 'Point Annotation';
            return 'Measurement Properties';
        },
        colorLabel() {
            if (this.isPoint) return 'Color';
            return this.isPolygon ? 'Outline color' : 'Line color';
        },
        widthLabel() {
            return this.isPolygon ? 'Outline width' : 'Line width';
        },
        // The point where it is (its geometry is in the map's projection), as the field first shows it
        pointText() {
            const geom = this.isPoint ? this.feature?.getGeometry?.() : null;
            if (!geom) return '';
            const [lon, lat] = toLonLat(geom.getCoordinates());
            return latLonText(lat, lon);
        },
        // The point the field holds: its latitude and longitude, or the error of what was typed (none for a measurement)
        located() {
            return this.isPoint ? parseLatLon(this.coordsInput) : { lat: 0, lon: 0 };
        },
        groupOptions() {
            return [{ label: 'None (ungrouped)', value: '' }, ...this.groups.map(g => ({ label: g.name, value: g.id }))];
        }
    },
    mounted() {
        // `!== undefined` keeps a legitimate 0, which `||` would replace
        const get = (k) => this.feature.get(k);
        this.formData.name = get('name') || '';
        this.formData.description = get('description') || '';
        this.formData.stroke = get('stroke') || MEASURE_COLOR;
        this.formData['stroke-width'] = get('stroke-width') !== undefined ? get('stroke-width') : 2;
        this.formData['stroke-opacity'] = get('stroke-opacity') !== undefined ? get('stroke-opacity') : 1;
        this.formData.fill = get('fill') || MEASURE_COLOR;
        this.formData['fill-opacity'] = get('fill-opacity') !== undefined ? get('fill-opacity') : 0.2;
        this.formData.groupId = get('groupId') || '';
        this.fields = Object.fromEntries(FIELD_KEYS.filter(key => get(key) !== undefined && get(key) !== null).map(key => [key, get(key)]));
        this.coordsInput = this.pointText;
    },
    methods: {
        latLonText,
        latLonDmsText,
        // The properties of this geometry: a point has no width or fill, a line no fill
        properties() {
            const { name, description, stroke, groupId } = this.formData;
            const properties = { name, description, stroke, groupId };
            if (!this.isPoint) {
                properties['stroke-width'] = this.formData['stroke-width'];
                properties['stroke-opacity'] = this.formData['stroke-opacity'];
            }
            if (this.isPolygon) {
                properties.fill = this.formData.fill;
                properties['fill-opacity'] = this.formData['fill-opacity'];
            }
            // A point moves only when its coordinates were changed: the text it was shown with is where it is, to
            // the 6 decimals shown, and saving it unchanged must not round the point to them
            const { lat, lon } = this.located;
            if (this.isPoint && latLonText(lat, lon) !== this.pointText) properties.coordinates = [lon, lat];
            // An empty reference leaves the one it has (a measurement is never left without)
            const { ref, ...fields } = storedFields(this.fields);
            Object.assign(properties, fields);
            if (ref !== undefined) properties.ref = ref;
            return properties;
        },
        save() {
            if (this.located.error || !this.fieldsValid) return;
            this.done = true;
            this.$emit('save', this.properties());
            this.$emit('close');
        },
        deleteMeasurement() {
            this.done = true;
            this.$emit('delete');
            this.$emit('close');
        },
        // Cancel, the close button and Esc: a new point that was not saved is not kept
        cancel() {
            if (this.isNew && !this.done) this.$emit('discard');
            this.$emit('close');
        }
    }
};
</script>

<style scoped>
.measurement-properties-form {
    padding: 1rem;
    min-width: min(18.75rem, var(--window-content-width, 100%));
}

.coords-field {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.coords-input {
    flex: 1;
    min-width: 0;
    font-family: monospace;
}

.coords-help {
    color: var(--ddb-text-muted);
}
</style>
