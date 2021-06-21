<template>
<div id="upload">
    <div v-if="error" class="error-msg">
        <Message bindTo="error" />
    </div>
    <div class="container" v-if="uploading">
        <div v-if="uploading" class="uploading">
            <div v-if="totalBytes === 0">
                <i class="icon circle notch spin" />
            </div>

            <div class="ui segment" v-if="totalBytes > 0">
                <div v-if="Object.keys(fileUploadStatus).length === 0">
                    <i class="icon circle notch spin" />
                </div>
                <div v-for="f in Object.keys(fileUploadStatus)" class="progress-indicator">
                    <div class="ui indicating progress small success">
                        <div class="bar" :style="{'min-width': (fileUploadStatus[f]).toFixed(2) + '%'}">
                            <div class="progress"></div>
                        </div>
                        <div class="label">{{ f }} - {{ (fileUploadStatus[f]).toFixed(2) }}%</div>
                    </div>
                </div>
                <div v-if="totalBytes - totalBytesSent > 0" class="remaining">
                    <span>Remaining: {{ uploadedFiles }} / {{ filesCount }} files ({{ humanRemainingBytes }})</span>
                </div>
                <div class="ui bottom attached progress">
                    <div class="bar" :style="{'min-width': totalProgress + '%'}"></div>
                </div>
            </div>

            <button class="ui button large negative" @click="handleCancel">
                <i class="stop circle outline icon"></i> Cancel
            </button>
        </div>
    </div>
    <div v-if="done">
        <div class="ui icon positive message" v-if="error==null">
            <i class="check circle outline icon"></i> 
            <div class="content">
                <div class="header">
                Success!
                </div>
                Your files have been added to the dataset
            </div>
        </div>
        <div @click="resetUpload" class="ui primary submit button"><i class="redo icon"></i> Upload More</div>
    </div>

    <div class="droparea" :class="{hide: done || uploading}" ref="droparea">
        <div ref="btnUpload" @click="handleUpload" class="ui huge primary submit button"><i class="cloud upload icon"></i> Browse</div>
    </div>
</div>
</template>

<script>
import Message from 'commonui/components/Message.vue';
import ddb from 'ddb';
import { bytesToSize } from 'commonui/classes/utils';
import Dropzone from '../vendor/dropzone';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message
    },
    props: ['organization', 'dataset', 'path', 'open'],
    data: function () {
        return {
            error: null,
            
            uploading: false,
            fileUploadStatus: {},
            filesCount: 0,
            uploadedFiles: 0,

            totalBytes: 0,
            totalBytesSent: 0,
            lastUpdated: 0,

            done: false
        }
    },
    computed: {
        humanRemainingBytes: function(){
            return bytesToSize(this.totalBytes - this.totalBytesSent);
        },

        totalProgress: function(){
            if (this.totalBytes === 0) return 0;
            return (this.totalBytesSent / this.totalBytes * 100.0).toFixed(2);
        },

        fullUrl: function(){
            return reg.url + this.url;
        }
    },
    beforeMount: function(){

    },
    mounted: async function(){
        Dropzone.autoDiscover = false;
        const MAX_RETRIES = 30;

        this.dz = new Dropzone(this.$refs.droparea, {
            paramName: function(){ return "file"; },
            url : "/share/upload/<uuid>", // change this later
            parallelUploads: 8, // http://blog.olamisan.com/max-parallel-http-connections-in-a-browser max parallel connections
            uploadMultiple: false,
            autoProcessQueue: false,
            createImageThumbnails: false,
            maxFilesize: Number.MAX_SAFE_INTEGER,
            previewTemplate: '<div style="display:none"></div>',
            clickable: this.$refs.btnUpload,
            chunkSize: Number.MAX_SAFE_INTEGER,
            timeout: 2147483647
        });

        this.dz.on("processing", (file) => {
            this.dz.options.url = `/orgs/${this.organization}/ds/${this.dataset}/obj`;
            this.$set(this.fileUploadStatus, file.name, 0);
        })
        .on("error", (file, message) => {
            this.error = ((this.error != null && this.error.length > 0) ? this.error + '<br /><br />' : '') + `Failed to upload ${file.name}<br />${message.error}`;
            this.dz.cancelUpload(file);
            file.status = Dropzone.CANCELED;
            this.$delete(this.fileUploadStatus, file.name);
            this.dz.removeFile(file);

            setTimeout(() => this.dz.processQueue(), 2000); // Wait 2 secs
        })
        .on("uploadprogress", (file, progress, bytesSent) => {
            const now = new Date().getTime();

            if (bytesSent > file.size) bytesSent = file.size;
            
            if (progress === 100 || now - this.lastUpdated > 500){
                const deltaBytesSent = bytesSent - file.deltaBytesSent;
                file.trackedBytesSent += deltaBytesSent;

                this.totalBytesSent = this.totalBytesSent + deltaBytesSent;
                this.lastUpdated = now;
                this.$set(this.fileUploadStatus, file.name, progress);
                file.deltaBytesSent = bytesSent;
            }
        })
        .on("addedfiles", async (files) => {
            this.filesCount = this.filesCount + files.length;

            this.totalBytes = 0;
            this.totalBytesSent = 0;

            for (let i = 0; i < files.length; i++){
                this.totalBytes += files[i].size;
                files[i].deltaBytesSent = 0;
                files[i].trackedBytesSent = 0;
                files[i].retries = 0;
            }

            this.uploading = true;
            this.dz.processQueue();
           
        })
        .on("complete", (file, res) => {
            if (file.status === "success"){
                this.uploadedFiles = this.uploadedFiles + 1;

                // Update progress by removing the tracked progress and 
                // use the file size as the true number of bytes
                this.totalBytesSent = this.totalBytesSent + file.size;
                if (file.trackedBytesSent) this.totalBytesSent -= file.trackedBytesSent;
                
                this.$emit('onUpload', JSON.parse(file.xhr.response));
            } else {
                //let err = `Failed to upload ${file.name}`;
                this.$log.warn(`Failed to upload ${file.name}`);
                this.dz.cancelUpload(file);   
                //this.error = err;
                this.dz.removeFile(file);
            }

            this.$delete(this.fileUploadStatus, file.name);

            setTimeout(() => this.dz.processQueue(), 2000); // Wait 2 secs
        })
        .on("sending", (file, xhr, formData) => {
            // Send filename
            formData.append("path", this.path == null ? file.name : this.path + "/" + file.name);
        })
        .on("queuecomplete", async (files) => {
            // Commit
            if (this.uploadedFiles - this.filesCount === 0){                
                this.uploading = false;
                this.done = true;
            }
        })
        .on("reset", () => {
            this.filesCount = 0;
            this.uploadedFiles = 0;
            this.done = false;
        });

        if (this.open) {
            this.$refs.btnUpload.click();
        }
    },
    methods: {
        resetUpload: function(){
            this.filesCount = 0;
            this.totalBytes = 0;
            this.lastUpdated = 0;
            this.totalBytesSent = 0;            
            this.error = null;
            this.uploading = false;
            this.done = false;
            //this.uploadToken = null;
            this.uploadedFiles = 0;
            this.fileUploadStatus = {};
            if (this.dz) this.dz.removeAllFiles(true);
        },

        handleCancel: function(){
            this.resetUpload();
        },

        handleUpload: function(){
            this.dz.removeAllFiles(true);
        }
    }
}
</script>

<style scoped>
.button, .container, .error-msg {
    margin: 16px;
}
.container {
    justify-content: center;
}
.droparea{
    width: 100%;
    height: 100%;
}
#upload{
    text-align: center;
    height: 100%;
}
.uploading{
    text-align: center;
    .circle.notch{
        margin-bottom: 12px;
        height: 20px;
        width: 22px;
    }
    .progress-indicator{
        margin-bottom: 36px;
    }
}
.hide{
    visibility: hidden;
}
</style>
