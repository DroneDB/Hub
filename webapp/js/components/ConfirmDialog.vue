<template>
    <Window :title="title" id="confirmDialog" @onClose="close('cancel')" modal maxWidth="70%" fixedSize>
        <div v-html="safeMessage"></div>

        <PrimeMessage v-if="warningMessage" severity="warn" :closable="false" class="mt-3">
            <template v-if="warningTitle" #default>
                <strong>{{ warningTitle }}</strong><br />{{ warningMessage }}
            </template>
            <template v-else #default>{{ warningMessage }}</template>
        </PrimeMessage>

        <slot name="extra"></slot>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button :label="cancelText" @click="close('cancel')" severity="secondary" />
            <Button v-if="secondaryText" :label="secondaryText" @click="close('secondary')" :severity="secondaryButtonClass" />
            <Button :label="confirmText" @click="close('confirm')" :severity="confirmButtonClass" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import { sanitizeHtml } from '@/libs/sanitize';

/**
 * ConfirmDialog - Confirmation dialog with configurable confirm/cancel/secondary buttons.
 *
 * Optionally shows a warning block above the actions. Sanitizes the message
 * prop via DOMPurify before rendering.
 *
 * Props:
 *   title                - Dialog title.
 *   message              - HTML body (sanitized).
 *   confirmText          - Label for the confirm button (default: 'Ok').
 *   cancelText           - Label for the cancel button (default: 'Cancel').
 *   secondaryText        - Optional label for a secondary action button.
 *   warningMessage       - Optional warning text shown above the buttons.
 *   warningTitle         - Optional bold title for the warning block.
 *   confirmButtonClass   - PrimeVue severity for the confirm button (default: 'danger').
 *   secondaryButtonClass - PrimeVue severity for the secondary button.
 */
export default {
    components: {
        Window,
        Button,
        PrimeMessage
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
