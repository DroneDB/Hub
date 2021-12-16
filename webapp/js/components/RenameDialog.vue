<template>
    <Window title="Rename" id="rename" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        <input class="renameInput" 
                ref="renameInput" 
                v-on:keyup.enter="rename"
                v-on:keyup.esc="close"
                
                v-model="renamePath" 
                :error="renamePath == null || renamePath.length == 0" />

        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="rename" :disabled="!renamePath" class="ui button positive">
                Rename
            </button>
        </div>
    </Window>
</template>

<script>
import Window from 'commonui/components/Window.vue';

export default {
    components: {
        Window
    },

    props: ["path"],

    data: function() {
        return {
            basePath: null,
            renamePath: null
        };
    },
    mounted: function() {

        // Get file path and folder from path
        var path = this.path;
        this.basePath = path.substring(0, path.lastIndexOf('/'));
        this.renamePath = path.substring(path.lastIndexOf('/') + 1);

        this.$nextTick(() => {
            this.$refs.renameInput.focus();
        });
    },
    methods: {
        close: function(buttonId) {
            this.$emit('onClose', buttonId);
        },
        rename: function(){
            if (this.renamePath) {

                // Check that renamePath does not contain any invalid characters
                if (this.renamePath.indexOf('/') != -1 || 
                    this.renamePath.indexOf('\\') != -1 || 
                    this.renamePath.indexOf('..') != -1 || 
                    this.renamePath.indexOf('.') == 0) {
                    
                    this.$refs.renameInput.setCustomValidity("Invalid characters in path");
                    return;
                }                

                this.$emit('onClose', "rename", (this.basePath != null && this.basePath.length > 0) ? this.basePath + '/' + this.renamePath : this.renamePath);
            }
        }
    }
}
</script>

<style scoped>
.renameInput{
    margin-top: 8px;
    width: 100%;
}
.buttons{
    margin-top: 16px;
    text-align: right;
}
</style>