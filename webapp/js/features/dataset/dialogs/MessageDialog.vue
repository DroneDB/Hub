<template>
    <Window id="info" title="Information" modal max-width="70%" fixed-size @on-close="close('close')">

        {{ message }}

        <br>

        <div class="text-end mt-3">
            <Button severity="secondary" label="Close" @click="close('close')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';

export default {
    components: {
        Window, Button
    },

    props: ["message"],
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