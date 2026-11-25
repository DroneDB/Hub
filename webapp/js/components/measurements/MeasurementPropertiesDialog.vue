<template>
    <Window id="measurement-properties" :title="dialogTitle" modal fixed-size size-class="dialog-lg" @close="cancel" @confirm="save">
        <div class="measurement-properties-form">
            <AnnotationTabs v-model:photos="photos" v-model:tab="tab" :photo-context="photoContext"
                            :item-name="formData.name" :snapshot="captureAction.snapshot.value" :can-capture="!!capture">
                <!-- What names the item: its name and its reference, side by side -->
                <div class="name-row">
                    <div class="name-field">
                        <label for="mp-name" class="d-block mb-1 fw-semibold">Name</label>
                        <InputText id="mp-name" v-model="formData.name" placeholder="Optional" autocomplete="off" class="w-100" />
                    </div>
                    <AnnotationRefField v-model="fields" id-prefix="mp" class="ref-field" :is-ref-taken="isRefTaken" @update:valid="refValid = $event" />
                </div>

                <div class="form-field">
                    <label for="mp-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="mp-description" v-model="formData.description" placeholder="Optional" rows="2" :maxlength="FIELD_LIMITS.description" auto-resize class="w-100" />
                </div>

                <div v-if="isPoint" class="form-field">
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

                <div v-if="groups.length > 0 || canCreateGroup" class="form-field">
                    <label id="mp-group-label" for="mp-group" class="d-block mb-1 fw-semibold">Group</label>
                    <div class="group-field">
                        <Select v-model="formData.groupId" input-id="mp-group" aria-labelledby="mp-group-label" :options="groupOptions"
                                option-label="label" option-value="value" placeholder="None (ungrouped)" class="group-select" />
                        <Button v-if="canCreateGroup" type="button" severity="secondary" outlined icon="fa-solid fa-folder-plus" label="New"
                                title="Make a group and put this measurement in it" data-testid="mp-new-group" @click="groupDialogOpen = true" />
                    </div>
                </div>

                <!-- What is changed less often folds away; each closed part says what it holds -->
                <Accordion v-model:value="sections.open.value" multiple class="properties-sections">
                    <FormSection value="appearance" title="Appearance" header-testid="mp-appearance" summary-testid="mp-appearance-summary">
                        <template #summary>
                            <span class="swatch" :style="{ background: formData.stroke }" aria-hidden="true" />
                            <span v-if="isPolygon" class="swatch swatch--fill" :style="{ background: formData.fill, opacity: Math.max(formData['fill-opacity'], 0.15) }" aria-hidden="true" />
                            <span>{{ appearanceSummary }}</span>
                        </template>
                        <div class="appearance-grid">
                            <div class="form-field form-field--wide">
                                <label for="mp-stroke" class="d-block mb-1 fw-semibold">{{ colorLabel }}</label>
                                <ColorSwatchPicker v-model="formData.stroke" input-id="mp-stroke" :label="colorLabel" />
                            </div>
                            <div v-if="isPolygon" class="form-field form-field--wide">
                                <label for="mp-fill" class="d-block mb-1 fw-semibold">Fill color</label>
                                <ColorSwatchPicker v-model="formData.fill" input-id="mp-fill" label="Fill color" />
                            </div>
                            <div v-if="!isPoint" class="form-field">
                                <label for="mp-stroke-width" class="d-block mb-1 fw-semibold">{{ widthLabel }}: {{ formData['stroke-width'] }} px</label>
                                <input id="mp-stroke-width" v-model.number="formData['stroke-width']" type="range" min="1" max="10" step="1" class="w-100">
                            </div>
                            <div v-if="isPolygon" class="form-field">
                                <label for="mp-fill-opacity" class="d-block mb-1 fw-semibold">Fill opacity: {{ Math.round(formData['fill-opacity'] * 100) }}%</label>
                                <input id="mp-fill-opacity" v-model.number="formData['fill-opacity']" type="range" min="0" max="1" step="0.1" class="w-100">
                            </div>
                        </div>
                    </FormSection>
                    <FormSection value="inspection" title="Inspection" :summary="inspectionText" header-testid="mp-inspection" summary-testid="mp-inspection-summary">
                        <AnnotationFields v-model="fields" id-prefix="mp" :schema="schema" @update:valid="fieldsValid = $event" />
                    </FormSection>
                </Accordion>
            </AnnotationTabs>
            <p v-if="captureAction.message.value" class="capture-message" role="status">{{ captureAction.message.value }}</p>
        </div>
        <MeasurementGroupDialog v-if="groupDialogOpen" @save="chooseNewGroup" @close="groupDialogOpen = false" />

        <template #footer>
            <Button v-if="showDelete && !isNew" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    :title="`Delete this ${isPoint ? 'annotation' : 'measurement'}`" @click="deleteMeasurement" />
            <Button v-if="capture" label="Capture for report" icon="fa-solid fa-camera" severity="secondary" text
                    :loading="captureAction.capturing.value" title="Frame this measurement and keep the 3D view as its picture in reports" @click="captureAction.run" />
            <Button :label="isNew ? 'Discard' : 'Cancel'" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm :disabled="!canSave" @click="save" />
        </template>
    </Window>
</template>

<script>
/**
 * The properties of a measurement or a point annotation: its name and reference (AnnotationRefField) side by side,
 * its description, the coordinates of a point (typed or pasted to move it: decimal degrees or DMS, see parseLatLon),
 * its group (with New group when the host can make one: the group is made only when the measurement is saved), then two parts that fold away (FormSection), each saying what it holds when closed: Appearance (the
 * colours, the width of a line, the fill of an area) and Inspection (AnnotationFields: category, severity, status,
 * due date, assignee, in reports); and, when it is given a `photoContext`, its photos (AnnotationTabs). The parts stay
 * as the user left them (useFoldedSections); Inspection opens by itself when it has values or a field to fix. The one
 * dialog of a measurement, however it is opened (a double click, the edit button of a point's callout, the
 * measurement list, a point just placed).
 *
 * Emits `save` with the properties that apply to the geometry (a point has no width or fill; `coordinates`, its new
 * [longitude, latitude], only when they were changed; the annotation fields as they are stored, a field with no value
 * as undefined so that it is cleared, the `ref` only when there is one; `newGroup`, { name, color }, when the measurement
 * goes in a group made in the dialog: the host makes it and puts the measurement in it), `delete` from the
 * Delete button, and `discard` when a new point (`isNew`) is not kept: Discard, the close button or Esc.
 */
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Accordion from 'primevue/accordion';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import FieldError from '@/components/FieldError.vue';
import AnnotationFields from '@/components/measurements/AnnotationFields.vue';
import AnnotationRefField from '@/components/measurements/AnnotationRefField.vue';
import FormSection from '@/components/FormSection.vue';
import { useFoldedSections } from '@/composables/useFoldedSections';
import AnnotationTabs from '@/components/measurements/AnnotationTabs.vue';
import MeasurementGroupDialog from '@/components/measurements/MeasurementGroupDialog.vue';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { FIELD_KEYS, FIELD_LIMITS, inspectionSummary, storedFields } from '@/libs/map/annotationIds';
import { storedPhotos } from '@/libs/reports/annotationPhotos';
import { useDialogCapture } from '@/libs/reports/snapshots/useCaptureAction';
import { toLonLat } from 'ol/proj';
import { latLonText, latLonDmsText, parseLatLon } from '@/libs/format';
import { useCopyText } from '@/composables/useCopyText';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';

/** The value of the group made in the dialog in the Group list: no group id, which a file can make up, can be it */
const NEW_GROUP = Symbol('new group');

/** The annotation fields a feature has (a field with no value is absent) */
const fieldsOf = feature => Object.fromEntries(FIELD_KEYS.filter(key => feature.get(key) !== undefined && feature.get(key) !== null).map(key => [key, feature.get(key)]));

export default {
    components: {
        Window, Button, InputText, Textarea, Select, Accordion,
        ColorSwatchPicker, FieldError, AnnotationFields, AnnotationRefField, AnnotationTabs, FormSection, MeasurementGroupDialog
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
        // The host can make a group: the dialog has New group (a measurement saved in it comes with `newGroup`)
        canCreateGroup: {
            type: Boolean,
            default: false
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
        },
        // What the Photos tab needs ({ dataset, measurementPath, itemId, geometry, readOnly, photos, snapshot }, see AnnotationTabs;
        // photos: the ones the annotation has, snapshot: its capture for reports): without it the dialog has no Photos tab and saves none
        photoContext: {
            type: Object,
            default: null
        },
        // { run } of the "Capture for report" button: the point cloud viewer's, for a writer (it writes the 3D view as the
        // item's picture to the dataset and keeps it in the item). The map does not give one, and the dialog has no button
        capture: {
            type: Object,
            default: null
        }
    },
    emits: ['close', 'save', 'delete', 'discard'],
    setup(props) {
        const { copy: copyCoords, copied: coordsCopied } = useCopyText({ resetMs: 1500 });
        // Appearance and Inspection fold away and stay as the user left them; Inspection opens by itself when the
        // measurement has inspection values
        const sections = useFoldedSections('annotation-properties', {
            opened: () => (inspectionSummary(fieldsOf(props.feature), props.schema) ? ['inspection'] : [])
        });
        return { copyCoords, coordsCopied, FIELD_LIMITS, sections, ...useDialogCapture(props) };
    },
    data() {
        return {
            // The coordinates of a point as the field shows them: "latitude, longitude"
            coordsInput: '',
            // Set once Save or Delete is chosen: the close that follows is not a discard
            done: false,
            // The New group dialog is open; the group it made ({ name, color }), offered until the measurement is saved
            groupDialogOpen: false,
            newGroup: null,
            // The annotation fields (reference, category, ...) and whether they can be saved
            fields: {},
            fieldsValid: true,
            refValid: true,
            // The photos the annotation has (the Photos tab changes them), and what they were
            photos: [],
            savedPhotos: [],
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
        canSave() {
            return !this.located.error && this.fieldsValid && this.refValid;
        },
        appearanceSummary() {
            if (this.isPoint) return '';
            const width = `${this.formData['stroke-width']} px`;
            return this.isPolygon ? `Outline ${width} · fill ${Math.round(this.formData['fill-opacity'] * 100)}%` : `Line ${width}`;
        },
        inspectionText() {
            return inspectionSummary(this.fields, this.schema) || 'Nothing set';
        },
        groupOptions() {
            const options = [{ label: 'None (ungrouped)', value: '' }, ...this.groups.map(g => ({ label: g.name, value: g.id }))];
            if (this.newGroup) options.push({ label: `${this.newGroup.name} (new)`, value: NEW_GROUP });
            return options;
        }
    },
    watch: {
        // A field of Inspection that cannot be saved is shown, even when the section was closed
        fieldsValid(valid) {
            if (!valid) this.sections.reveal('inspection');
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
        this.fields = fieldsOf(this.feature);
        this.coordsInput = this.pointText;
        this.photos = [...(this.photoContext?.photos || [])];
        this.savedPhotos = this.photos;
    },
    methods: {
        latLonText,
        latLonDmsText,
        // The group made with New group is the one chosen; another New group replaces it
        chooseNewGroup(group) {
            this.newGroup = group;
            this.formData.groupId = NEW_GROUP;
        },
        // The properties of this geometry: a point has no width or fill, a line no fill
        properties() {
            const { name, description, stroke } = this.formData;
            const inNewGroup = this.formData.groupId === NEW_GROUP;
            const properties = { name, description, stroke, groupId: inNewGroup ? '' : this.formData.groupId };
            if (inNewGroup) properties.newGroup = this.newGroup;
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
            // The photos only when the tab was used and they changed (an empty list clears them)
            if (this.photoContext && this.photos !== this.savedPhotos) properties.photos = storedPhotos(this.photos);
            return properties;
        },
        save() {
            if (!this.canSave) return;
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

.form-field {
    margin-bottom: var(--ddb-spacing-md);
}

/* The name takes the room, the reference (at most 8 characters) a narrow column */
.name-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem;
    gap: var(--ddb-spacing-md);
    margin-bottom: var(--ddb-spacing-md);
}

.properties-sections {
    margin-top: var(--ddb-spacing-sm);
}

/* The colours and the sliders: two sliders side by side, a colour row across */
.appearance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
    column-gap: var(--ddb-spacing-md);
}

.form-field--wide {
    grid-column: 1 / -1;
}

.appearance-grid .form-field:last-child {
    margin-bottom: 0;
}

.swatch {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 2px;
    border: 1px solid rgba(var(--ddb-ink-rgb), 0.25);
    flex-shrink: 0;
}

.capture-message {
    margin: 0;
    font-size: var(--ddb-font-size-sm);
}

.group-field {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.group-select {
    flex: 1;
    min-width: 0;
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
