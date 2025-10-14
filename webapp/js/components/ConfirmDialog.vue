<template>
    <Window :title="title" id="confirmDialog" @onClose="close('cancel')" modal maxWidth="70%" fixedSize>
        <div v-html="message"></div>

        <div v-if="warningMessage" class="ui negative message" style="margin-top: 16px;">
            <div class="header" v-if="warningTitle">
                {{ warningTitle }}
            </div>
            <p>{{ warningMessage }}</p>
        </div>

        <div class="buttons">
            <button @click="close('cancel')" class="ui button">
                {{ cancelText }}
            </button>
            <button @click="close('confirm')" class="ui button" :class="confirmButtonClass">
                {{ confirmText }}
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

    props: {
        title: {
            type: String,
            default: 'Confirm'
        },
        message: {
            type: String,
            required: true
        },
        confirmText: {
            type: String,
            default: 'Confirm'
        },
        cancelText: {
            type: String,
            default: 'Cancel'
        },
        confirmButtonClass: {
            type: String,
            default: 'primary'
        },
        warningMessage: {
            type: String,
            default: null
        },
        warningTitle: {
            type: String,
            default: null
        }
    },

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
            if (e.key === 'Enter') this.close('confirm');
            if (e.key === 'Escape') this.close('cancel');
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
