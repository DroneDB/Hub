<template>
    <Window id="annotation-properties" title="Annotation" modal fixed-size size-class="dialog-sm" @close="cancel" @confirm="save">
        <div class="annotation-properties-form">
            <div class="mb-3">
                <label for="ap-name" class="d-block mb-1 fw-semibold">Name</label>
                <InputText id="ap-name" v-model="formData.name" placeholder="Optional" autocomplete="off" class="w-100" />
            </div>

            <div class="mb-3">
                <label for="ap-description" class="d-block mb-1 fw-semibold">Description</label>
                <Textarea id="ap-description" v-model="formData.description" placeholder="Optional" rows="3" auto-resize class="w-100" />
            </div>

            <CopyableCoordinates v-if="coordsCopyText" label-id="ap-position-label" label="Position" class="mb-3" :text="coordsText" :copy-text="coordsCopyText" />
        </div>

        <template #footer>
            <Button v-if="showDelete" label="Delete" icon="fa-solid fa-trash" severity="danger" text class="me-auto"
                    title="Delete this annotation" @click="deleteAnnotation" />
            <Button label="Cancel" severity="secondary" @click="cancel" />
            <Button label="Save" data-confirm @click="save" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import CopyableCoordinates from '@/components/measurements/CopyableCoordinates.vue';
import { htmlToText } from '@/libs/sanitize';

/**
 * AnnotationPropertiesDialog - Properties editor for Potree annotations.
 *
 * Name, description, and the read-only XYZ position with a copy button (CopyableCoordinates).
 * Emits save with the changes, delete when the delete button
 * is pressed (annotation stays in memory until the caller removes it).
 *
 * Props:
 *   annotation    - Potree.Annotation object with `title`, `description`, and `position` (THREE.Vector3).
 *   showDelete    - Whether to show the Delete button (default: true).
 */
export default {
    components: {
        Window, Button, InputText, Textarea, CopyableCoordinates
    },
    props: {
        annotation: {
            type: Object,
            required: true
        },
        showDelete: {
            type: Boolean,
            default: true
        }
    },
    emits: ['close', 'save', 'delete'],
    data() {
        return {
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
        }
    },
    methods: {
        save() {
            this.$emit('save', { ...this.formData });
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
