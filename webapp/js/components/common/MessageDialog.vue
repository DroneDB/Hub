<template>
    <Window title="Information" id="info" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        {{ message }}

        <br />

        <div class="buttons">
            <Button @click="close('close')" severity="secondary" label="Close" />
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
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
.buttons {
    margin-top: 16px;
    text-align: right;
}
</style>