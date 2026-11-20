<template>
    <Window id="confirmDialog" :title="title" modal max-width="70%" fixed-size
            :danger="danger" :enter-confirms="!danger || !!requireText" :confirm-disabled="!textMatches"
            @close="$emit('close', 'cancel')" @confirm="confirm">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised with libs/sanitize.js -->
        <div v-html="safeMessage" />

        <PrimeMessage v-if="warningMessage" severity="warn" :closable="false" class="mt-3">
            <template v-if="warningTitle" #default>
                <strong>{{ warningTitle }}</strong><br>{{ warningMessage }}
            </template>
            <template v-else #default>{{ warningMessage }}</template>
        </PrimeMessage>

        <div v-if="requireText" class="mt-3">
            <label :for="inputId" class="d-block mb-1">Type <strong>{{ requireText }}</strong> to confirm</label>
            <InputText :id="inputId" v-model="typed" class="w-100" autocomplete="off" spellcheck="false" data-autofocus />
        </div>

        <slot name="extra" />

        <template #footer>
            <Button :label="cancelText" severity="secondary" data-cancel @click="$emit('close', 'cancel')" />
            <Button v-if="secondaryText" :label="secondaryText" :severity="secondaryButtonClass" @click="$emit('close', 'secondary')" />
            <Button :label="confirmText" :severity="confirmButtonClass" data-confirm :disabled="!textMatches" @click="confirm" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import { useId } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import { sanitizeHtml } from '@/libs/sanitize';

/**
 * ConfirmDialog - Confirmation dialog with configurable confirm/cancel/secondary buttons.
 *
 * Optionally shows a warning block above the actions. Sanitizes the message
 * prop via DOMPurify before rendering.
 *
 * A danger dialog (confirmButtonClass 'danger') is a destructive confirmation: the focus
 * starts on Cancel and Enter does not confirm. With requireText it asks the user to type that
 * text first (case-sensitive, surrounding spaces ignored): Confirm stays disabled until then,
 * the input has the focus, and Enter there confirms once the text matches.
 *
 * Props:
 *   title                - Dialog title.
 *   message              - HTML body (sanitized).
 *   confirmText          - Label for the confirm button (default: 'Ok').
 *   cancelText           - Label for the cancel button (default: 'Cancel').
 *   secondaryText        - Optional label for a secondary action button.
 *   warningMessage       - Optional warning text shown above the buttons.
 *   warningTitle         - Optional bold title for the warning block.
 *   confirmButtonClass   - PrimeVue severity for the confirm button (default: 'primary'; 'danger' makes a destructive confirmation).
 *   secondaryButtonClass - PrimeVue severity for the secondary button.
 *   requireText          - Text the user types to enable Confirm (typed confirmation).
 */
export default {
    components: {
        Window,
        Button,
        InputText,
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
        },
        requireText: {
            type: String,
            default: ''
        }
    },
    emits: ['close'],

    setup() {
        return { inputId: useId() };
    },

    data: function () {
        return { typed: '' };
    },
    computed: {
        safeMessage: function () {
            return sanitizeHtml(this.message);
        },
        danger() {
            return this.confirmButtonClass === 'danger';
        },
        textMatches() {
            return !this.requireText || this.typed.trim() === this.requireText;
        }
    },
    methods: {
        confirm() {
            if (this.textMatches) this.$emit('close', 'confirm');
        }
    }
}
</script>

<style scoped>
</style>
