<template>
    <Window title="Create folder" id="newFolder" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        <InputText class="newFolderInput" ref="newFolderInput" v-on:keyup.enter="createFolder" v-on:keyup.esc="close"
            v-model="newFolderPath" :invalid="!newFolderPath" placeholder="Folder name" />

        <div class="buttons">
            <Button @click="close('close')" severity="secondary" label="Close" />
            <Button @click="createFolder" :disabled="!newFolderPath" severity="success" label="Create folder" />
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
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
    margin-top: 8px;
}

.buttons {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>