<template>
    <Window id="newFolder" title="Create folder" modal max-width="70%" fixed-size cancel-label="Close" confirm-label="Create folder" :confirm-disabled="!newFolderPath" :busy="busy" @confirm="createFolder" @close="onWindowClose">

        <InputText ref="newFolderInput" v-model="newFolderPath" class="newFolderInput" :invalid="!newFolderPath"
                   :disabled="busy" placeholder="Folder name" />

    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import InputText from 'primevue/inputtext';

export default {
    components: {
        Window, InputText
    },

    props: {
        busy: { type: Boolean, default: false }
    },
    emits: ['close'],

    data: function () {
        return {
            newFolderPath: null
        };
    },
    methods: {
        onWindowClose: function () {
            // Block close while a folder creation is in progress
            if (this.busy) return;
            this.close('close');
        },
        close: function (buttonId) {
            if (this.busy && buttonId !== 'createFolder') return;
            this.$emit('close', buttonId);
        },
        createFolder: function () {
            if (this.busy) return;
            if (this.newFolderPath) {
                this.$emit('close', "createFolder", this.newFolderPath);
            }
        }
    }
}
</script>

<style scoped>
.newFolderInput {
    width: 100%;
    margin-top: 0.5rem;
}
</style>