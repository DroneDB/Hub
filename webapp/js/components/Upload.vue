<template>
<div id="upload">
    <div v-if="error" class="error-msg">
        <Message bindTo="error" />
    </div>
    <div class="container" v-if="uploading || url">
        <div v-if="uploading" class="uploading">
            <div v-if="totalBytes === 0">
                <i class="icon circle notch spin" />
            </div>

            <div class="ui segment" v-if="totalBytes > 0">
                <div v-if="Object.keys(fileUploadStatus).length === 0">
                    <i class="icon circle notch spin" />
                </div>
                <div v-if="!inIframe" v-for="f in Object.keys(fileUploadStatus)" class="progress-indicator">
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

        <div v-if="url">
            <div class="ui icon positive message">
                <i class="check circle outline icon"></i> 
                <div class="content">
                    <div class="header">
                    Success!
                    </div>
                    Your files have been uploaded to the secret URL: <a :href="fullUrl" target="_blank">{{ fullUrl }}</a>
                </div>
            </div>

            <div @click="resetUpload" class="ui primary submit button"><i class="redo icon"></i> Upload More</div>
        </div>
    </div>

    <div class="droparea" :class="{hide: url || uploading}" ref="droparea">
        <div ref="btnUpload" @click="handleUpload" class="ui huge primary submit button"><i class="cloud upload icon"></i> Upload Files</div>
    </div>

</div>
</template>

<script>
import Message from 'commonui/components/Message.vue';
import ddb from 'ddb';
import { bytesToSize } from 'commonui/classes/utils';
import Dropzone from '../vendor/dropzone';
import { inIframe } from '../libs/utils';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message
    },
    data: function () {
        return {
            error: "",
            
            uploading: false,
            fileUploadStatus: {},
            filesCount: 0,
            uploadedFiles: 0,
            inIframe: inIframe(),

            totalBytes: 0,
            totalBytesSent: 0,
            lastUpdated: 0,

            url: ""
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
        if (!reg.isLoggedIn()){
            this.$router.push({name: "Login"}).catch(()=>{});
        }
    },
    mounted: async function(){
        Dropzone.autoDiscover = false;
        this.uploadToken = null;
        const MAX_RETRIES = 30;

        this.dz = new Dropzone(this.$refs.droparea, {
            paramName: function(){ return "file"; },
            url : "/share/upload/<uuid>", // change this later
            parallelUploads: 8, // http://blog.olamisan.com/max-parallel-http-connections-in-a-browser max parallel connections
            uploadMultiple: false,
            autoProcessQueue: false,
            createImageThumbnails: false,
            previewTemplate: '<div style="display:none"></div>',
            clickable: this.$refs.btnUpload,
            chunkSize: 2147483647, // TODO: support for chunked uploads, read maxuploadChunkSize
            timeout: 2147483647
        });

        this.dz.on("processing", (file) => {
            if (!this.uploadToken) this.dz.cancelUpload(file);
            this.dz.options.url = `/share/upload/${this.uploadToken}`;
            this.$set(this.fileUploadStatus, file.name, 0);
        })
        .on("error", (file) => {
            // Retry
            if (file.retries < MAX_RETRIES){
                console.log("Error uploading ", file, " put back in queue...");
                file.status = Dropzone.QUEUED;
            }else{
                this.dz.cancelUpload(file);
                this.error = `Failed to upload ${file.name} after 30 retries`;
                this.uploading = false;
            }
            this.$delete(this.fileUploadStatus, file.name);
            this.dz.processQueue();
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

            try{
                this.uploading = true;
                const r = await reg.makeRequest('/share/init', "POST");
                this.uploadToken = r.token;
                this.dz.processQueue();
            }catch(e){
                this.error = `Cannot initialize upload: ${e.message}`;
                this.uploading = false;
            }
        })
        .on("complete", (file) => {
            if (file.status === "success"){
                this.uploadedFiles = this.uploadedFiles + 1;

                // Update progress by removing the tracked progress and 
                // use the file size as the true number of bytes
                this.totalBytesSent = this.totalBytesSent + file.size;
                if (file.trackedBytesSent) this.totalBytesSent -= file.trackedBytesSent;
            }else{
                let err = `Failed to upload ${file.name}, retrying... (${file.retries})`;
                console.error(err);

                // Update progress
                this.totalBytesSent = this.totalBytesSent - file.trackedBytesSent;
                file.status = Dropzone.QUEUED;
                file.deltaBytesSent = 0;
                file.trackedBytesSent = 0;
                file.retries++;

                if (file.retries > MAX_RETRIES){
                    this.dz.cancelUpload(file);
                    this.error = err;
                }
            }
            this.$delete(this.fileUploadStatus, file.name);
            this.dz.processQueue();
        })
        .on("sending", (file, xhr, formData) => {
            // Send filename
            formData.append("path", file.name);
        })
        .on("queuecomplete", async (files) => {
            // Commit
            if (this.uploadedFiles - this.filesCount === 0){
                try{
                    const r = await reg.makeRequest(`/share/commit/${this.uploadToken}`, "POST");
                    if (r.url){
                        this.url = r.url;
                    }else if (r.error){
                        this.error = r.error;
                    }else{
                        this.error = `Cannot upload files: ${JSON.stringify(r)}`;
                    }
                }catch(e){
                    this.error = e.message;
                }
                this.uploading = false;
            }
        })
        .on("reset", () => {
            this.filesCount = 0;
            this.uploadedFiles = 0;
        });
    },
    methods: {
        resetUpload: function(){
            this.filesCount = 0;
            this.totalBytes = 0;
            this.lastUpdated = 0;
            this.totalBytesSent = 0;
            this.url = "";
            this.error = "";
            this.uploading = false;
            this.uploadToken = null;
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
