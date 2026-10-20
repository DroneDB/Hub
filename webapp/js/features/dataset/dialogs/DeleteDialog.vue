<template>
    <Window id="remove" title="Confirm delete" modal max-width="70%" fixed-size @close="close('close')" @confirm="close('remove')">
        <div class="mb-3">Are you sure you want to delete <span v-if="files.length === 1">"{{ files[0].label }}"</span><span v-else>{{
            files.length }} entries</span>?</div>
        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button label="Close" severity="secondary" @click="close('close')" />
            <Button label="Remove" severity="danger" @click="close('remove')" />
        </div>
    </Window>
</template>

<script>
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
    emits: ['close'],

    data: function () {
        return {};
    },
    methods: {
        close: function (buttonId) {
            this.$emit('close', buttonId);
        }
    }
}
</script>

<style scoped>
</style>
