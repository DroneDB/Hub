<template>
    <Window id="measurement-group" :title="dialogTitle" modal fixed-size size-class="dialog-sm"
            :confirm-label="isEdit ? 'Rename' : 'Create'" :confirm-disabled="!formName.trim()"
            @close="cancel" @confirm="save">
        <div class="measurement-group-form">
            <div class="form-group">
                <label for="mg-name">Group Name</label>
                <input id="mg-name" ref="nameInput" v-model="formName" type="text" placeholder="Enter a group name...">
            </div>
            <div class="form-group">
                <label for="mg-color">Color</label>
                <ColorSwatchPicker v-model="formColor" input-id="mg-color" />
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
    emits: ['close', 'save'],
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
            this.$emit('save', { name, color: this.formColor });
            this.$emit('close');
        },
        cancel() {
            this.$emit('close');
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

</style>
