<template>
    <Window id="point-annotation" title="Point Annotation" modal fixed-size size-class="dialog-sm" @on-close="discard">
        <div class="point-annotation-form">
            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold" for="pa-color">Color</label>
                <ColorSwatchPicker v-model="formData.color" input-id="pa-color" />
            </div>

            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold" for="pa-description">Description</label>
                <Textarea id="pa-description" v-model="formData.description" placeholder="Enter a description..." rows="3" auto-resize class="w-100" />
            </div>

            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button severity="secondary" label="Discard" @click="discard" />
                <Button severity="primary" label="Save" @click="save" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';

export default {
    components: {
        Window,
        Button,
        Textarea,
        ColorSwatchPicker
    },
    props: {
        initialColor: {
            type: String,
            default: MEASURE_COLOR
        },
        initialDescription: {
            type: String,
            default: ''
        }
    },
    emits: ['onClose', 'onSave', 'onDiscard'],
    data() {
        return {
            formData: {
                color: this.initialColor,
                description: this.initialDescription
            }
        };
    },
    methods: {
        save() {
            this.$emit('onSave', { ...this.formData });
            this.$emit('onClose');
        },
        discard() {
            this.$emit('onDiscard');
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>
.point-annotation-form {
    padding: 1rem;
    min-width: 18.75rem;
}
</style>
