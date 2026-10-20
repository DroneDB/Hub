<template>
    <Window id="newFolder" title="Create folder" modal max-width="70%" fixed-size @on-close="onWindowClose">

        <InputText ref="newFolderInput" v-model="newFolderPath" class="newFolderInput" :invalid="!newFolderPath"
                   :disabled="busy" placeholder="Folder name" @keyup.enter="createFolder" @keyup.esc="close('close')" />

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button :disabled="busy" severity="secondary" label="Close" @click="close('close')" />
            <Button :disabled="!newFolderPath || busy" :loading="busy" severity="primary" label="Create folder" @click="createFolder" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

export default {
    components: {
        Window, Button, InputText
    },

    props: {
        busy: { type: Boolean, default: false }
    },
    emits: ['onClose'],

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
            this.$emit('onClose', buttonId);
        },
        createFolder: function () {
            if (this.busy) return;
            if (this.newFolderPath) {
                this.$emit('onClose', "createFolder", this.newFolderPath);
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