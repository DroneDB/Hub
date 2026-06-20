<template>
    <Window :title="title" id="alert" @onClose="dismiss('cancel')" modal maxWidth="70%" fixedSize>

        <slot />

        <div class="text-center mt-3">
            <Button severity="secondary" label="Close" @click="dismiss('ok')" v-if="buttons.indexOf('ok') !== -1" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';

/**
 * Alert - Modal alert dialog with a dismissible "Close" button.
 *
 * Props:
 *   title   - Dialog title.
 *   message - Message text (rarely used; prefer the default slot).
 *   buttons - Button set to show; supported value: 'ok' (default: ['ok']).
 */
export default {
    components: {
        Window,
        Button
    },
    props: {
        title: {
            type: String,
            default: '',
            required: false
        },
        message: {
            type: String,
            default: '',
            required: false
        },
        buttons: {
            type: Array,
            default: () => ['ok'],
            required: false
        }
    },
    emits: ['onClose'],

    data: function () {
        return {};
    },
    mounted: function () {
    },
    methods: {
        dismiss: function (buttonId) {
            this.$emit('onClose', buttonId);
        }
    }
}
</script>

<style scoped>
</style>
