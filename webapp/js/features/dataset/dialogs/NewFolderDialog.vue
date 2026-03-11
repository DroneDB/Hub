<template>
    <Window title="Create folder" id="newFolder" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        <InputText class="newFolderInput" ref="newFolderInput" v-on:keyup.enter="createFolder" v-on:keyup.esc="close"
            v-model="newFolderPath" :invalid="!newFolderPath" placeholder="Folder name" />

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close('close')" severity="secondary" label="Close" />
            <Button @click="createFolder" :disabled="!newFolderPath" severity="primary" label="Create folder" />
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

    props: [],
    emits: ['onClose'],

    data: function () {
        return {
            newFolderPath: null
        };
    },
    mounted: function () {
        this.$nextTick(() => {
            const el = this.$refs.newFolderInput?.$el || this.$refs.newFolderInput;
            if (el && el.focus) el.focus();
        });
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },
        createFolder: function () {
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