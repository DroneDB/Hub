<template>
    <Window title="Confirm delete" id="remove" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        Are you sure you want to delete the dataset '{{ dsSlug }}'?<br />

        <PrimeMessage severity="error" :closable="false">
            <strong>This action is irreversible.</strong>
            <p>All the files will be deleted too.</p>
        </PrimeMessage>

        <div class="d-flex justify-content-end gap-2 mt-3">
            <Button @click="close('close')" severity="secondary" label="Close" />
            <Button @click="close('remove')" severity="danger" label="Remove" />
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';

export default {
    components: {
        Window, Button, PrimeMessage
    },

    props: ["dsSlug"],
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