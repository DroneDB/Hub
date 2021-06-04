<template>
    <Window title="Rename / Move" id="rename" @onClose="close" 
            :modal="true"
            maxWidth="70%"
            :fixedSize="true">
        
        <DatasetUpload :organization="organization" :dataset="dataset" :path="path" @onUpload="onUploaded"></DatasetUpload>
        <div class="buttons">
            <button @click="close" class="ui button">
                Close
            </button>
        </div>
    </Window>
</template>

<script>
import Window from 'commonui/components/Window.vue';
import DatasetUpload from './DatasetUpload.vue';
import { clone } from 'commonui/classes/utils';

export default {
  components: {
      Window,
      DatasetUpload
  },

  props: ['organization', 'dataset', 'path'],
    
  data: function(){
      return {
          uploaded: []
      };
  },
  mounted: function(){
  },
  methods: {
      close: function(){
          this.$emit('onClose', this.uploaded);
      },
      onUploaded: function(file) {
          this.uploaded.push(file);
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