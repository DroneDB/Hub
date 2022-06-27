<template>
    <Window title="Rename" id="rename" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        <input class="renameInput" 
                ref="renameInput" 
                v-on:keyup.enter="rename"
                v-on:keyup.esc="close"
                
                v-model="renameText" 
                :error="renameText == null || renameText.length == 0" />

        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="rename" :disabled="!renameText" class="ui button positive">
                Rename
            </button>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import ddb from 'ddb';

export default {
    components: {
        Window
    },

    props: ["file"],

    data: function() {
        return {
            renameText: null
        };
    },
    mounted: function() {
        this.renameText = this.file.label;

        this.$nextTick(() => {
            this.$refs.renameInput.focus();
            
            this.$refs.renameInput.select();
            const dotIdx = this.renameText.indexOf(".");
            if (dotIdx !== -1){
                this.$refs.renameInput.selectionEnd = dotIdx;
            }
        });
    },
    methods: {
        close: function(buttonId) {
            this.$emit('onClose', buttonId);
        },
        rename: function(){
            if (this.renameText) {
                if (this.file.entry.type === ddb.entry.type.DRONEDB){
                    this.$emit('onClose', "renameddb", this.renameText, this.entry);
                }else{
                    let basePath = this.file.entry.path.substring(0, this.file.entry.path.lastIndexOf('/'));

                    // Check that renameText does not contain any invalid characters
                    if (this.renameText.indexOf('/') != -1 || 
                        this.renameText.indexOf('\\') != -1 || 
                        this.renameText.indexOf('..') != -1 || 
                        this.renameText.indexOf('.') == 0) {
                        
                        this.$refs.renameInput.setCustomValidity("Invalid characters in path");
                        return;
                    }

                    this.$emit('onClose', "rename", (basePath != null && basePath.length > 0) ? basePath + '/' + this.renameText : this.renameText);
                }
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
