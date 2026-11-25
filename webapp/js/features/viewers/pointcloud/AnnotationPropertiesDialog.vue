<template>
    <Window id="annotation-properties" title="Annotation" modal fixed-size size-class="dialog-lg" @close="cancel" @confirm="save">
        <div class="annotation-properties-form">
            <AnnotationTabs v-model:photos="photos" v-model:tab="tab" :photo-context="photoContext"
                            :item-name="formData.name" :snapshot="captureAction.snapshot.value" :can-capture="!!capture">
                <!-- What names the item: its name and its reference, side by side -->
                <div class="name-row">
                    <div>
                        <label for="ap-name" class="d-block mb-1 fw-semibold">Name</label>
                        <InputText id="ap-name" v-model="formData.name" placeholder="Optional" autocomplete="off" class="w-100" />
                    </div>
                    <AnnotationRefField v-model="fields" id-prefix="ap" :is-ref-taken="isRefTaken" @update:valid="refValid = $event" />
                </div>

                <div class="mb-3">
                    <label for="ap-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="ap-description" v-model="formData.description" placeholder="Optional" rows="2" :maxlength="FIELD_LIMITS.description" auto-resize class="w-100" />
                </div>

                <CopyableCoordinates v-if="coordsCopyText" label-id="ap-position-label" label="Position" class="mb-3" :text="coordsText" :copy-text="coordsCopyText" />

                <Accordion v-model:value="sections.open.value" multiple>
                    <FormSection value="inspection" title="Inspection" :summary="inspectionText" header-testid="ap-inspection" summary-testid="ap-inspection-summary">
                        <AnnotationFields v-model="fields" id-prefix="ap" :schema="schema" @update:valid="fieldsValid = $event" />
                    </FormSection>
                </Accordion>
            </AnnotationTabs>
            <p v-if="captureAction.message.value" class="capture-message" role="status">{{ captureAction.message.value }}</p>
        </div>

        <template #footer>
            <Button v-if="showDelete" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    title="Delete this annotation" @click="deleteAnnotation" />
            <Button v-if="capture" label="Capture for report" icon="fa-solid fa-camera" severity="secondary" text
                    :loading="captureAction.capturing.value" title="Frame this annotation and keep the 3D view as its picture in reports" @click="captureAction.run" />
            <Button label="Cancel" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm :disabled="!canSave" @click="save" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Accordion from 'primevue/accordion';
import FormSection from '@/components/FormSection.vue';
import AnnotationRefField from '@/components/measurements/AnnotationRefField.vue';
import { useFoldedSections } from '@/composables/useFoldedSections';
import CopyableCoordinates from '@/components/measurements/CopyableCoordinates.vue';
import AnnotationFields from '@/components/measurements/AnnotationFields.vue';
import AnnotationTabs from '@/components/measurements/AnnotationTabs.vue';
import { htmlToText } from '@/libs/sanitize';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { FIELD_LIMITS, inspectionSummary, storedFields } from '@/libs/map/annotationIds';
import { storedPhotos } from '@/libs/reports/annotationPhotos';
import { annotationFieldsOf } from '@/libs/potree/measureStyle';
import { useDialogCapture } from '@/libs/reports/snapshots/useCaptureAction';

/**
 * AnnotationPropertiesDialog - Properties editor for Potree annotations.
 *
 * Name and reference (AnnotationRefField) side by side, description, the read-only XYZ position with a copy button
 * (CopyableCoordinates), and the inspection fields (AnnotationFields: category, severity, status, due date, assignee,
 * in reports) in an Inspection part that folds away as the map's dialog does (useFoldedSections, the same choice).
 * Emits save with the changes (the fields as they are stored: a field with no value is undefined, so that it is
 * cleared, and the `ref` is there only when it has a value), delete when the delete button
 * is pressed (annotation stays in memory until the caller removes it).
 *
 * Props:
 *   annotation    - Potree.Annotation object with `title`, `description`, and `position` (THREE.Vector3).
 *   showDelete    - Whether to show the Delete button (default: true).
 *   schema        - The organization's annotation schema (categories, severities, statuses).
 *   isRefTaken    - Says whether another annotation of the file has a reference (the one edited does not count).
 *   photoContext  - What the Photos tab needs ({ dataset, measurementPath, itemId, geometry, readOnly, photos, snapshot }, see
 *                   AnnotationTabs). Without it the dialog has no Photos tab and saves none; with it `save` has `photos`
 *                   when they were changed (undefined for none left).
 *   capture       - { run } of the "Capture for report" button (a writer's: it writes the 3D view as the annotation's picture
 *                   to the dataset and keeps it in the annotation). Without it the dialog has no such button.
 */
export default {
    components: {
        Window, Button, InputText, Textarea, Accordion, FormSection, CopyableCoordinates, AnnotationFields, AnnotationRefField, AnnotationTabs
    },
    props: {
        annotation: {
            type: Object,
            required: true
        },
        showDelete: {
            type: Boolean,
            default: true
        },
        schema: {
            type: Object,
            default: () => DEFAULT_SCHEMA
        },
        isRefTaken: {
            type: Function,
            default: () => false
        },
        photoContext: {
            type: Object,
            default: null
        },
        capture: {
            type: Object,
            default: null
        }
    },
    emits: ['close', 'save', 'delete'],
    setup(props) {
        // Inspection opens by itself when the annotation has inspection values, else as the user last left it
        const sections = useFoldedSections('annotation-properties', {
            opened: () => (props.annotation && inspectionSummary(annotationFieldsOf(props.annotation), props.schema) ? ['inspection'] : [])
        });
        return { FIELD_LIMITS, sections, ...useDialogCapture(props) };
    },
    data() {
        return {
            fields: {},
            fieldsValid: true,
            refValid: true,
            // The photos the annotation has (the Photos tab changes them), and what they were
            photos: [],
            savedPhotos: [],
            formData: {
                name: '',
                description: ''
            }
        };
    },
    computed: {
        canSave() {
            return this.fieldsValid && this.refValid;
        },
        inspectionText() {
            return inspectionSummary(this.fields, this.schema) || 'Nothing set';
        },
        coordsText() {
            const pos = this.annotation?.position;
            if (!pos || !pos.toArray) return '';
            return pos.toArray()
                .map(c => parseFloat(c).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
                .join(', ');
        },
        // Plain comma-separated numbers (no grouping commas), to paste elsewhere
        coordsCopyText() {
            const pos = this.annotation?.position;
            if (!pos || !pos.toArray) return '';
            return pos.toArray().map(c => parseFloat(c).toFixed(3)).join(', ');
        }
    },
    watch: {
        // A field of Inspection that cannot be saved is shown, even when the part was closed
        fieldsValid(valid) {
            if (!valid) this.sections.reveal('inspection');
        }
    },
    mounted() {
        // Load annotation properties
        if (this.annotation) {
            // Potree holds both as HTML: the form is plain text
            this.formData.name = htmlToText(this.annotation.title);
            this.formData.description = htmlToText(this.annotation.description);
            this.fields = annotationFieldsOf(this.annotation);
        }
        this.photos = [...(this.photoContext?.photos || [])];
        this.savedPhotos = this.photos;
    },
    methods: {
        save() {
            if (!this.canSave) return;
            // An empty reference leaves the one the annotation has
            const { ref, ...fields } = storedFields(this.fields);
            const photos = this.photoContext && this.photos !== this.savedPhotos ? { photos: storedPhotos(this.photos) } : {};
            this.$emit('save', { ...this.formData, ...fields, ...(ref !== undefined ? { ref } : {}), ...photos });
            this.$emit('close');
        },
        deleteAnnotation() {
            this.$emit('delete');
            this.$emit('close');
        },
        cancel() {
            this.$emit('close');
        }
    }
};
</script>

<style scoped>
.annotation-properties-form {
    padding: 1rem;
    min-width: min(18.75rem, var(--window-content-width, 100%));
}

.name-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem;
    gap: var(--ddb-spacing-md);
    margin-bottom: var(--ddb-spacing-md);
}

.capture-message {
    margin: 0;
    font-size: var(--ddb-font-size-sm);
}
</style>
