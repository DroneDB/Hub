<template>
    <Window title="Rename / Move" id="rename" @onClose="close('close')" 
            :modal="true"
            maxWidth="70%"
            :fixedSize="true">
        
        <DatasetUpload :organization="organization" :dataset="dataset"></DatasetUpload>
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
        </div>
    </Window>
</template>

<script>
import Window from 'commonui/components/Window.vue';
import DatasetUpload from './DatasetUpload.vue';

export default {
  components: {
      Window,
      DatasetUpload
  },

  props: ['organization', 'dataset'],
  
  data: function(){
      return {};
  },
  mounted: function(){
  },
  methods: {
      close: function(buttonId){
          this.$emit('onClose', buttonId);
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