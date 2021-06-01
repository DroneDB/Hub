<template>
    <Window title="Rename / Move" id="rename" @onClose="close('close')" 
            :modal="true"
            maxWidth="70%"
            :fixedSize="true">

        New path:&nbsp;&nbsp;<input v-model="renamePath" :error="renamePath == null || renamePath.length == 0" />
        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="rename()" :disabled="renamePath == null || renamePath.length == 0" class="ui button positive">
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
  
  data: function(){
      return {
          renamePath: null
      };
  },
  mounted: function(){
      this.renamePath = this.path;
  },
  methods: {
      close: function(buttonId){
          this.$emit('onClose', buttonId);
      },
      rename: function(){
          this.$emit('onClose', "rename", this.renamePath);
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