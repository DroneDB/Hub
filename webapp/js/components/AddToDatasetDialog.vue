<template>
    <Window title="Add to dataset" id="addToDataset" @onClose="close" 
            modal
            fixedSize>
        <div style="min-width: 320px"> 
            <DatasetUpload :organization="organization" 
                            :dataset="dataset" 
                            :path="path" 
                            @onUpload="onUploaded"
                            @done="done"
                            :open="open"
                            :filesToUpload="filesToUpload"></DatasetUpload>
            <div class="buttons">
                <button @click="close" class="ui button">
                    Close
                </button>
            </div>
        </div>
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

  props: ['organization', 'dataset', 'path', 'open', 'filesToUpload'],
    
  data: function(){
      return {
          uploaded: []          
      };
  },
  mounted: function(){
  },
  methods: {
      close: function(uploadSuccess){
          this.$emit('onClose', this.uploaded, uploadSuccess);
      },
      onUploaded: function(file) {
          this.uploaded.push(file);
      },
      done: function(){
          this.close(true);
      }
  }
}
</script>

<style scoped>
.buttons{
    margin-top: 16px;
    text-align: right;
}
</style>