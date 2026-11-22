<template>
    <Window id="annotation-properties" title="Annotation" modal fixed-size :size-class="photoContext ? 'dialog-md' : 'dialog-sm'" @close="cancel" @confirm="save">
        <div class="annotation-properties-form">
            <AnnotationTabs v-model:photos="photos" :photo-context="photoContext" :item-name="formData.name">
                <div class="mb-3">
                    <label for="ap-name" class="d-block mb-1 fw-semibold">Name</label>
                    <InputText id="ap-name" v-model="formData.name" placeholder="Optional" autocomplete="off" class="w-100" />
                </div>

                <div class="mb-3">
                    <label for="ap-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="ap-description" v-model="formData.description" placeholder="Optional" rows="3" :maxlength="FIELD_LIMITS.description" auto-resize class="w-100" />
                </div>

                <CopyableCoordinates v-if="coordsCopyText" label-id="ap-position-label" label="Position" class="mb-3" :text="coordsText" :copy-text="coordsCopyText" />

                <AnnotationFields v-model="fields" id-prefix="ap" class="mb-3" :schema="schema" :is-ref-taken="isRefTaken" @update:valid="fieldsValid = $event" />
            </AnnotationTabs>
            <p v-if="captureAction.message.value" class="capture-message" role="status">{{ captureAction.message.value }}</p>
        </div>

        <template #footer>
            <Button v-if="showDelete" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    title="Delete this annotation" @click="deleteAnnotation" />
            <Button v-if="capture" label="Capture for report" icon="fa-solid fa-camera" severity="secondary" text
                    :loading="captureAction.capturing.value" title="Frame this annotation and keep the 3D view as its picture in reports" @click="captureAction.run" />
            <Button label="Cancel" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm :disabled="!fieldsValid" @click="save" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import CopyableCoordinates from '@/components/measurements/CopyableCoordinates.vue';
import AnnotationFields from '@/components/measurements/AnnotationFields.vue';
import AnnotationTabs from '@/components/measurements/AnnotationTabs.vue';
import { htmlToText } from '@/libs/sanitize';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { FIELD_LIMITS, storedFields } from '@/libs/map/annotationIds';
import { storedPhotos } from '@/libs/reports/annotationPhotos';
import { annotationFieldsOf } from '@/libs/potree/measureStyle';
import { useCaptureAction } from '@/libs/reports/snapshots/useCaptureAction';

/**
 * AnnotationPropertiesDialog - Properties editor for Potree annotations.
 *
 * Name, description, the annotation fields (AnnotationFields: reference, category, severity, status, assignee, due
 * date, in reports) and the read-only XYZ position with a copy button (CopyableCoordinates).
 * Emits save with the changes (the fields as they are stored: a field with no value is undefined, so that it is
 * cleared, and the `ref` is there only when it has a value), delete when the delete button
 * is pressed (annotation stays in memory until the caller removes it).
 *
 * Props:
 *   annotation    - Potree.Annotation object with `title`, `description`, and `position` (THREE.Vector3).
 *   showDelete    - Whether to show the Delete button (default: true).
 *   schema        - The organization's annotation schema (categories, severities, statuses).
 *   isRefTaken    - Says whether another annotation of the file has a reference (the one edited does not count).
 *   photoContext  - What the Photos tab needs ({ dataset, measurementPath, itemId, geometry, readOnly, photos }, see
 *                   AnnotationTabs). Without it the dialog has no Photos tab and saves none; with it `save` has `photos`
 *                   when they were changed (undefined for none left).
 *   capture       - { run } of the "Capture for report" button (a writer's: it writes the 3D view as the annotation's picture
 *                   to the dataset and keeps it in the annotation). Without it the dialog has no such button.
 */
export default {
    components: {
        Window, Button, InputText, Textarea, CopyableCoordinates, AnnotationFields, AnnotationTabs
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
        return { FIELD_LIMITS, captureAction: useCaptureAction(() => props.capture) };
    },
    data() {
        return {
            fields: {},
            fieldsValid: true,
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
            if (!this.fieldsValid) return;
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

.capture-message {
    margin: 0;
    font-size: var(--ddb-font-size-sm);
}
</style>
