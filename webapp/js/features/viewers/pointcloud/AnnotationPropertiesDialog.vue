<template>
    <Window id="annotation-properties" title="Annotation" modal fixed-size size-class="dialog-sm" @close="cancel" @confirm="save">
        <div class="annotation-properties-form">
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
        </div>

        <template #footer>
            <Button v-if="showDelete" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    title="Delete this annotation" @click="deleteAnnotation" />
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
import { htmlToText } from '@/libs/sanitize';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
import { FIELD_LIMITS, storedFields } from '@/libs/map/annotationIds';
import { annotationFieldsOf } from '@/libs/potree/measureStyle';

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
 */
export default {
    components: {
        Window, Button, InputText, Textarea, CopyableCoordinates, AnnotationFields
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
        }
    },
    emits: ['close', 'save', 'delete'],
    setup() {
        return { FIELD_LIMITS };
    },
    data() {
        return {
            fields: {},
            fieldsValid: true,
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
    },
    methods: {
        save() {
            if (!this.fieldsValid) return;
            // An empty reference leaves the one the annotation has
            const { ref, ...fields } = storedFields(this.fields);
            this.$emit('save', { ...this.formData, ...fields, ...(ref !== undefined ? { ref } : {}) });
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
</style>
