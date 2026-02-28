<template>
    <Window :title="title" id="alert" @onClose="dismiss('cancel')" modal maxWidth="70%" fixedSize>

        <slot />

        <div class="text-center mt-3">
            <Button label="OK" @click="dismiss('ok')" v-if="buttons.indexOf('ok') !== -1" />
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import Button from 'primevue/button';

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
