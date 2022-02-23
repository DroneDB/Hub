<template>
    <Window title="Create folder" id="newFolder" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        <input class="newFolderInput" 
                ref="newFolderInput" 
                v-on:keyup.enter="createFolder"
                v-on:keyup.esc="close"
                v-model="newFolderPath" 
                :error="!newFolderPath" />
        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="createFolder" :disabled="!newFolderPath" class="ui button positive">
                Create folder
            </button>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';

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
      this.$nextTick(() => {
        this.$refs.newFolderInput.focus();
      });
  },
  methods: {
      close: function(buttonId){
          this.$emit('onClose', buttonId);
      },
      createFolder: function(){
          if (this.newFolderPath){
            this.$emit('onClose', "createFolder", this.newFolderPath);
          }
      }
  }
}
</script>

<style scoped>
.newFolderInput{
    width: 100%;
    margin-top: 8px;
    padding: 4px;
}
.buttons{
    margin-top: 16px;
    text-align: right;
    button{
        margin: 0;
    }
}
</style>