<template>
    <Window :title="dialogTitle" id="addToDataset" @onClose="close" modal :closable="closable" :fixedSize="true">
        <DatasetUpload :organization="organization" :dataset="dataset" :path="path"
            @onUpload="onUploaded" @done="done" :filesToUpload="filesToUpload"
            @update:closable="updateClosable" @onClose="close"
            @update:waitingForFiles="updateWaitingForFiles"></DatasetUpload>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import DatasetUpload from '@/features/dataset/upload/DatasetUpload.vue';
import { clone } from '@/libs/utils';

export default {
    components: {
        Window,
        DatasetUpload
    },

    props: ['organization', 'dataset', 'path', 'filesToUpload'],
    emits: ['onClose'],

    data: function () {
        return {
            uploaded: [],
            closable: false,
            waitingForFiles: !this.filesToUpload || this.filesToUpload.length === 0
        };
    },
    computed: {
        dialogTitle() {
            return this.waitingForFiles ? 'Upload' : 'Upload Progress';
        }
    },
    mounted: function () {
    },
    methods: {
        close: function (uploadSuccess) {
            this.$emit('onClose', this.uploaded, uploadSuccess);
        },
        onUploaded: function (file) {
            this.uploaded.push(file);
        },
        done: function () {
            this.close(true);
        },
        updateClosable: function (value) {
            this.closable = value;
        },
        updateWaitingForFiles: function (value) {
            this.waitingForFiles = value;
        }
    }
}
</script>

<style scoped>
</style>