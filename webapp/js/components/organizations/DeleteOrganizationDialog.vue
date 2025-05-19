<template>
    <Window title="Confirm delete" id="remove" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        Are you sure you want to delete the organization '{{ orgSlug }}'?<br />

        <div class="ui negative message">
            <div class="header">
                This action is irreversible.
            </div>
            <p>All the datasets owned by this organization will be deleted too.</p>
        </div>

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
import Window from '../Window.vue';

export default {
    components: {
        Window
    },

    props: ["orgSlug"],

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