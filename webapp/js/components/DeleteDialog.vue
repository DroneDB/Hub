<template>
    <Window title="Confirm delete" id="remove" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        Are you sure to delete the following items?<br />
        <div class="ui bulleted list" style="max-height: 300px; overflow-y: auto">
            <div class="item" v-for="file in files">
                {{file.label}}
            </div>
        </div>        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="close('remove')" class="ui button negative">
                Remove
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

  props: ["files"],
  
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