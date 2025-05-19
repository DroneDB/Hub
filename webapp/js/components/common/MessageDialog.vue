<template>
    <Window title="Information" id="info" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        {{ message }}

        <br />

        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';

export default {
    components: {
        Window
    },

    props: ["message"],

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