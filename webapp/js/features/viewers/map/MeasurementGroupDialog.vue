<template>
    <Window :title="dialogTitle" id="measurement-group" @onClose="cancel" modal fixedSize sizeClass="dialog-sm">
        <div class="measurement-group-form">
            <div class="form-group">
                <label for="mg-name">Group Name</label>
                <input ref="nameInput" type="text" id="mg-name" v-model="formName" placeholder="Enter a group name..."
                    @keydown.enter="save" @keydown.esc="cancel" />
            </div>
            <div class="form-group">
                <label>Color</label>
                <div class="color-palette">
                    <div v-for="color in colorPalette" :key="color" class="color-swatch"
                        :class="{ selected: formColor === color }" :style="{ backgroundColor: color }"
                        @click="formColor = color"></div>
                    <input type="color" v-model="formColor" class="color-picker-custom" title="Custom color" />
                </div>
            </div>
            <div class="buttons">
                <button class="btn-cancel" @click="cancel">Cancel</button>
                <button class="btn-save" @click="save" :disabled="!formName.trim()">{{ isEdit ? 'Rename' : 'Create' }}</button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';

export default {
    components: { Window },
    props: {
        // When provided, the dialog is in "rename" mode
        group: {
            type: Object,
            default: null
        }
    },
    emits: ['onClose', 'onSave'],
    data() {
        return {
            formName: this.group ? this.group.name : '',
            formColor: this.group ? this.group.color : '#3388ff',
            colorPalette: [
                '#3388ff', // Blue (default)
                '#ffcc33', // Yellow
                '#ff0000', // Red
                '#00cc66', // Green
                '#ff6600', // Orange
                '#9900ff', // Purple
                '#00cccc', // Cyan
                '#333333'  // Dark gray
            ]
        };
    },
    computed: {
        isEdit() {
            return !!this.group;
        },
        dialogTitle() {
            return this.isEdit ? 'Rename Group' : 'New Group';
        }
    },
    mounted() {
        this.$nextTick(() => {
            if (this.$refs.nameInput) {
                this.$refs.nameInput.focus();
                this.$refs.nameInput.select();
            }
        });
    },
    methods: {
        save() {
            const name = this.formName.trim();
            if (!name) return;
            this.$emit('onSave', { name, color: this.formColor });
            this.$emit('onClose');
        },
        cancel() {
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>
.measurement-group-form {
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

.form-group input[type="text"] {
    width: 100%;
    padding: var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    font-size: var(--ddb-font-size-base);
    box-sizing: border-box;
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
    background: none;
}

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
}

.btn-save {
    background-color: var(--ddb-primary, #007bff);
    color: white;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    font-weight: 500;
}

.btn-save:hover:not(:disabled) {
    background-color: var(--ddb-primary-dark, #0056b3);
}

.btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-cancel {
    background: none;
    border: var(--ddb-border-width) solid var(--ddb-border);
    padding: 0.5rem 1.25rem;
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
    color: var(--ddb-text);
}

.btn-cancel:hover {
    background-color: var(--surface-hover, rgba(0, 0, 0, 0.04));
}
</style>
