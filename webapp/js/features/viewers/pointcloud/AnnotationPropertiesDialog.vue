<template>
    <Window id="annotation-properties" :title="dialogTitle" modal fixed-size size-class="dialog-sm" @close="cancel" @confirm="save">
        <div class="measurement-properties-form">
            <div class="form-group">
                <label for="ap-name">Name</label>
                <input id="ap-name" v-model="formData.name" type="text" placeholder="Enter a name...">
            </div>

            <div class="form-group">
                <label for="ap-description">Description</label>
                <textarea id="ap-description" v-model="formData.description" placeholder="Enter a description..." rows="3" />
            </div>

            <div class="form-group">
                <span id="ap-position-label" class="form-label">Position</span>
                <div class="coords-row" role="group" aria-labelledby="ap-position-label">
                    <code class="coords-text">{{ coordsText }}</code>
                    <button type="button" class="btn-copy-coords" :title="copyTooltip" :aria-label="copyTooltip" @click="copyCoordinates">
                        <i :class="copyIconClass" />
                    </button>
                </div>
            </div>

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
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import { useCopyText } from '@/composables/useCopyText';

/**
 * AnnotationPropertiesDialog - Properties editor for Potree annotations.
 *
 * Name, description, and read-only XYZ position display with clipboard copy.
 * Emits save with the changes, delete when the delete button
 * is pressed (annotation stays in memory until the caller removes it).
 *
 * Props:
 *   annotation    - Potree.Annotation object with `title`, `description`, and `position` (THREE.Vector3).
 *   showDelete    - Whether to show the Delete button (default: true).
 */
export default {
    components: {
        Window, Button
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
    setup() {
        const { copy: copyText, copied: coordsCopied } = useCopyText({ resetMs: 1500 });
        return { copyText, coordsCopied };
    },
    data() {
        return {
            formData: {
                name: '',
                description: ''
            }
        };
    },
    computed: {
        dialogTitle() {
            return this.formData.name ? `Edit: ${this.formData.name}` : 'Annotation Properties';
        },
        coordsText() {
            const pos = this.annotation?.position;
            if (!pos || !pos.toArray) return '—';
            return pos.toArray()
                .map(c => parseFloat(c).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
                .join(', ');
        },
        copyIconClass() {
            return this.coordsCopied ? 'fa-solid fa-check' : 'fa-regular fa-copy';
        },
        copyTooltip() {
            return this.coordsCopied ? 'Copied!' : 'Copy coordinates';
        }
    },
    mounted() {
        // Load annotation properties
        if (this.annotation) {
            this.formData.name = this.annotation.title || '';
            this.formData.description = this.annotation.description || '';
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
        },
        copyCoordinates() {
            const pos = this.annotation?.position;
            if (!pos || !pos.toArray) return;
            // Plain comma-separated numeric text (no grouping commas)
            const text = pos.toArray().map(c => parseFloat(c).toFixed(3)).join(', ');
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

</style>