<template>
    <Window id="remove" title="Confirm delete" modal max-width="70%" fixed-size @on-close="close('close')">

        <div class="mb-3">Are you sure you want to delete the organization '{{ orgSlug }}'?</div>

        <PrimeMessage severity="error" :closable="false">
            <strong>This action is irreversible.</strong>
            <p>All the datasets owned by this organization will be deleted too.</p>
        </PrimeMessage>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button severity="secondary" label="Close" @click="close('close')" />
            <Button severity="danger" label="Remove" @click="close('remove')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';

export default {
    components: {
        Window, Button, PrimeMessage
    },

    props: {
        orgSlug: { type: String, required: true }
    },
    emits: ['onClose'],

    data: function () {
        return {};
    },
    mounted: function () {
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        }
    }
}
</script>

<style scoped>
</style>