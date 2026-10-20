<template>
    <Window id="measurement-group" :title="dialogTitle" modal fixed-size size-class="dialog-sm" @on-close="cancel">
        <div class="measurement-group-form">
            <div class="form-group">
                <label for="mg-name">Group Name</label>
                <input id="mg-name" ref="nameInput" v-model="formName" type="text" placeholder="Enter a group name..."
                       @keydown.enter="save" @keydown.esc="cancel">
            </div>
            <div class="form-group">
                <label for="mg-color">Color</label>
                <ColorSwatchPicker v-model="formColor" input-id="mg-color" />
            </div>
            <div class="buttons">
                <button class="btn-cancel" @click="cancel">Cancel</button>
                <button class="btn-save" :disabled="!formName.trim()" @click="save">{{ isEdit ? 'Rename' : 'Create' }}</button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import { GROUP_COLOR } from '@/libs/map/mapUtils';

export default {
    components: { Window, ColorSwatchPicker },
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
            formColor: this.group ? this.group.color : GROUP_COLOR,
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
