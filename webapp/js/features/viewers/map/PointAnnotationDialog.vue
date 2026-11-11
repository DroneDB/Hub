<template>
    <Window id="point-annotation" title="Point Annotation" modal fixed-size size-class="dialog-sm" cancel-label="Discard" confirm-label="Save" @confirm="save" @close="discard">
        <div class="point-annotation-form">
            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold" for="pa-color">Color</label>
                <ColorSwatchPicker v-model="formData.color" input-id="pa-color" />
            </div>

            <div class="mb-3">
                <label class="d-block mb-1 fw-semibold" for="pa-description">Description</label>
                <Textarea id="pa-description" v-model="formData.description" placeholder="Enter a description..." rows="3" auto-resize class="w-100" />
            </div>

        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import ColorSwatchPicker from '@/components/ColorSwatchPicker.vue';
import Textarea from 'primevue/textarea';
import { MEASURE_COLOR } from '@/libs/map/mapUtils';

export default {
    components: {
        Window,
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
    emits: ['close', 'save', 'discard'],
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
            this.$emit('save', { ...this.formData });
            this.$emit('close');
        },
        discard() {
            this.$emit('discard');
            this.$emit('close');
        }
    }
};
</script>

<style scoped>
.point-annotation-form {
    padding: 1rem;
    min-width: min(18.75rem, var(--window-content-width, 100%));
}
</style>
