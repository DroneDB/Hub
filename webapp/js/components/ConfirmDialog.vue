<template>
    <Window :title="title" id="confirmDialog" @onClose="close('cancel')" modal maxWidth="70%" fixedSize>
        <div v-html="safeMessage"></div>

        <div v-if="warningMessage" class="warning-message" style="margin-top: 1rem; padding: 0.75rem; background: #fff3cd; border: 1px solid #ffc107; border-radius: 0.25rem; color: #856404;">
            <div class="header" v-if="warningTitle">
                {{ warningTitle }}
            </div>
            <p>{{ warningMessage }}</p>
        </div>

        <slot name="extra"></slot>

        <div class="d-flex justify-content-end gap-2 mt-3">
            <Button :label="cancelText" @click="close('cancel')" severity="secondary" />
            <Button v-if="secondaryText" :label="secondaryText" @click="close('secondary')" :severity="secondaryButtonClass" />
            <Button :label="confirmText" @click="close('confirm')" :severity="confirmButtonClass" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';
import Button from 'primevue/button';
import { sanitizeHtml } from '../libs/sanitize';

export default {
    components: {
        Window,
        Button
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
        secondaryText: {
            type: String,
            default: null
        },
        secondaryButtonClass: {
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
    emits: ['onClose'],

    data: function () {
        return {};
    },
    computed: {
        safeMessage: function () {
            return sanitizeHtml(this.message);
        }
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
            if (e.key === 'Enter') this.close('confirm');
            if (e.key === 'Escape') this.close('cancel');
        }
    }
}
</script>

<style scoped>
</style>
