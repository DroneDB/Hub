<template>
    <Window id="addToDataset" :title="dialogTitle" modal :closable="closable" :fixed-size="true" @on-close="close">
        <DatasetUpload :organization="organization" :dataset="dataset" :path="path"
                       :files-to-upload="filesToUpload" @on-upload="onUploaded" @done="done"
                       @update:closable="updateClosable" @on-close="close"
                       @update:waiting-for-files="updateWaitingForFiles"
                       @import-from-url="$emit('importFromUrl')" />
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import DatasetUpload from '@/features/dataset/upload/DatasetUpload.vue';

export default {
    components: {
        Window,
        DatasetUpload
    },

    props: ['organization', 'dataset', 'path', 'filesToUpload'],
    emits: ['onClose', 'importFromUrl'],

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