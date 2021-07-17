<template>
    <Window title="Rename" id="rename" @onClose="close('close')" 
            :modal="true"
            maxWidth="70%"
            :fixedSize="true">

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
  
  data: function(){
      return {
          renamePath: null
      };
  },
  mounted: function(){
      this.renamePath = this.path;
      this.$nextTick(() => {
          this.$refs.renameInput.focus();
      });
  },
  methods: {
      close: function(buttonId){
          this.$emit('onClose', buttonId);
      },
      rename: function(){
          if (this.renamePath){
            this.$emit('onClose', "rename", this.renamePath);
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