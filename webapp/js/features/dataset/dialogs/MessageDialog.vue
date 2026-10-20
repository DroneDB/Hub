<template>
    <Window id="info" title="Information" modal max-width="70%" fixed-size @close="$emit('close', 'close')">

        {{ message }}

        <br>

        <div class="text-end mt-3">
            <Button severity="secondary" label="Close" @click="$emit('close', 'close')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';

export default {
    components: {
        Window, Button
    },

    props: {
        message: { type: String, default: '' }
    },
    emits: ['close'],

    data: function () {
        return {};
    },
    mounted: function () {
    },
    methods: {
    }
}
</script>

<style scoped>
</style>