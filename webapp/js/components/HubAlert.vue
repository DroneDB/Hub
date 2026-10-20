<template>
    <Window id="alert" :title="title" modal max-width="70%" fixed-size @close="dismiss('cancel')">

        <slot>{{ message }}</slot>

        <div class="text-center mt-3">
            <Button v-if="buttons.indexOf('ok') !== -1" severity="secondary" label="Close" @click="dismiss('ok')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';

/**
 * Alert - Modal alert dialog with a dismissible "Close" button.
 *
 * Props:
 *   title   - Dialog title.
 *   message - Message text, when there is no slot content.
 *   buttons - Button set to show; supported value: 'ok' (default: ['ok']).
 */
export default {
    name: 'HubAlert',
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
    emits: ['close'],

    data: function () {
        return {};
    },
    mounted: function () {
    },
    methods: {
        dismiss: function (buttonId) {
            this.$emit('close', buttonId);
        }
    }
}
</script>

<style scoped>
</style>
