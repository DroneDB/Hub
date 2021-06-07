<template>
    <Window title="Create new folder" id="newFolder" @onClose="close('close')" 
            :modal="true"
            maxWidth="70%"
            :fixedSize="true">

        New folder name:&nbsp;&nbsp;<input v-model="newFolderPath" :error="newFolderPath == null || newFolderPath.length == 0" />
        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="createFolder()" :disabled="newFolderPath == null || newFolderPath.length == 0" class="ui button positive">
                Create folder
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

  props: [],
  
  data: function(){
      return {
          newFolderPath: null
      };
  },
  mounted: function(){
  },
  methods: {
      close: function(buttonId){
          this.$emit('onClose', buttonId);
      },
      createFolder: function(){
          this.$emit('onClose', "createFolder", this.newFolderPath);
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