<template>
    <Window title="Import in QGIS" 
            id="import-in-qgis" 
            modal
            fixedSize
            @onClose="$emit('onClose')">
        <div class="content">
            <Message bindTo="error" noDismiss />
            <i v-if="loading" class="icon circle notch spin" />

            <div class="ui icon positive message" v-if="!error">
                <i class="cloud upload icon"></i> 
                <div class="content">
                    <div class="header">
                    From QGIS
                    </div>
                    <div v-if="typeIs('POINTCLOUD')">
                        Select Layer <i class="arrow right icon"></i> Add Point Cloud Layer <i class="arrow right icon"></i> Source Type Protocol: HTTP(s) <i class="arrow right icon"></i> Copy/paste the URL below:
                    </div>
                    <div v-if="typeIs('GEORASTER')">
                        Select Layer <i class="arrow right icon"></i> Add Raster Layer <i class="arrow right icon"></i> Source Type Protocol: HTTP(s) <i class="arrow right icon"></i> Copy/paste the URL below:
                    </div>
                </div>
            </div>

            <div class="ui action input fluid">
                <input type="text" readonly :value="url" @click="copyToClipboard" title="Copy to clipboard"/>
                <button class="ui icon button teal" @click="copyToClipboard" title="Copy to clipboard">
                    <i :class="copyIcon" class="icon"></i>
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from './Window';
import Message from './Message';
import copy from 'clipboard-copy';
import ddb from 'ddb';

export default {
  components: {
      Window, Message
  },
  props: ["file"],
  data: function(){
      return {
          copyIcon: "copy",
          loading: true,
          error: "",
          url: ""
      };
  },
  mounted: async function(){
      const entry = ddb.utils.entryFromFile(this.file);
      try{
          if (entry.type === ddb.entry.type.POINTCLOUD) this.url = await entry.getEpt();
          else if (entry.type === ddb.entry.type.GEORASTER) this.url = await entry.getCog();
          else throw new Error(`Unknown type: ${entry.type}`);

          this.url = `${window.location.protocol}//${window.location.host}${this.url}`;
      }catch(e){
          this.error = e.message;
      }
      this.loading = false;
  },
  methods: {
      copyToClipboard: function(n){
          copy(this.url);
          this.copyIcon = "check";
          this.copyTextTimeout = setTimeout(() => {
              this.copyIcon = "copy";
              this.copyTextTimeout = null;
          }, 2000);
      },
      typeIs: function(t){
          return this.file.entry.type === ddb.entry.type[t];
      }
  }
}
</script>

<style scoped>
.content{
    width: 420px;
}
</style>