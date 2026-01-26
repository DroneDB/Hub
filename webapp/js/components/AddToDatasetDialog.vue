<template>
    <Window title="Upload Progress" id="addToDataset" @onClose="close" modal :closable="closable" :fixedSize="true">
        <DatasetUpload :organization="organization" :dataset="dataset" :path="path"
            @onUpload="onUploaded" @done="done" :filesToUpload="filesToUpload"
            @update:closable="updateClosable" @onClose="close"></DatasetUpload>
    </Window>
</template>

<script>
import Window from './Window.vue';
import DatasetUpload from './DatasetUpload.vue';
import { clone } from '../libs/utils';

export default {
    components: {
        Window,
        DatasetUpload
    },

    props: ['organization', 'dataset', 'path', 'filesToUpload'],

    data: function () {
        return {
            uploaded: [],
            closable: false
        };
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