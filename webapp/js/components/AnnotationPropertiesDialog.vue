<template>
    <Window :title="dialogTitle" id="annotation-properties" @onClose="cancel" modal fixedSize sizeClass="dialog-sm">
        <div class="measurement-properties-form">
            <div class="form-group">
                <label for="ap-name">Name</label>
                <input type="text" id="ap-name" v-model="formData.name" placeholder="Enter a name..." />
            </div>

            <div class="form-group">
                <label for="ap-description">Description</label>
                <textarea id="ap-description" v-model="formData.description" placeholder="Enter a description..." rows="3"></textarea>
            </div>

            <div class="form-group">
                <label>Position</label>
                <div class="coords-row">
                    <code class="coords-text">{{ coordsText }}</code>
                    <button type="button" class="btn-copy-coords" @click="copyCoordinates" :title="copyTooltip">
                        <i :class="copyIconClass"></i>
                    </button>
                </div>
            </div>

            <div class="buttons">
                <button v-if="showDelete" class="btn-delete" @click="deleteAnnotation" title="Delete this annotation">
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

/**
 * AnnotationPropertiesDialog - Properties editor for Potree annotations.
 *
 * Name, description, and read-only XYZ position display with clipboard copy.
 * Submits changes to an onSave callback; emits onDelete when the delete button
 * is pressed (annotation stays in memory until the caller removes it).
 *
 * Props:
 *   annotation    - Potree.Annotation object with `title`, `description`, and `position` (THREE.Vector3).
 *   showDelete    - Whether to show the Delete button (default: true).
 */
export default {
    components: {
        Window
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
    emits: ['onClose', 'onSave', 'onDelete'],
    data() {
        return {
            coordsCopied: false,
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
            this.$emit('onSave', { ...this.formData });
            this.$emit('onClose');
        },
        deleteAnnotation() {
            this.$emit('onDelete');
            this.$emit('onClose');
        },
        cancel() {
            this.$emit('onClose');
        },
        copyCoordinates() {
            const pos = this.annotation?.position;
            if (!pos || !pos.toArray) return;
            // Plain comma-separated numeric text (no grouping commas)
            const text = pos.toArray().map(c => parseFloat(c).toFixed(3)).join(', ');
            const done = () => {
                this.coordsCopied = true;
                setTimeout(() => { this.coordsCopied = false; }, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => { /* noop */ });
            } else {
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
</style>