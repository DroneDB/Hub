<template>
    <Window title="Confirm delete" id="remove" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        Are you sure you want to delete <span v-if="files.length === 1">"{{ files[0].label }}"</span><span v-else>{{
            files.length }} entries</span>?<br />
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="close('remove')" class="ui button negative">
                Remove
            </button>
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';

export default {
    components: {
        Window
    },

    props: ["files"],

    data: function () {
        return {};
    },
    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeDestroy: function () {
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
.buttons {
    margin-top: 16px;
    text-align: right;
}
</style>
