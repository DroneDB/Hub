<template>
    <Window id="remove" title="Confirm delete" modal max-width="70%" fixed-size @on-close="close('close')">
        <div class="mb-3">Are you sure you want to delete <span v-if="files.length === 1">"{{ files[0].label }}"</span><span v-else>{{
            files.length }} entries</span>?</div>
        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button label="Close" severity="secondary" @click="close('close')" />
            <Button label="Remove" severity="danger" @click="close('remove')" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';

export default {
    components: {
        Window,
        Button
    },

    props: {
        files: { type: Array, required: true }
    },
    emits: ['onClose'],

    data: function () {
        return {};
    },
    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeUnmount: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },

        handleKeyDown: function (e) {
            if (e.key === 'Enter') this.close('remove');
        }
    }
}
</script>

<style scoped>
</style>
