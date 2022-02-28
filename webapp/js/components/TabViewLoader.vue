<template>
<div class="tab-view-loader">
    <Message bindTo="error" noDismiss />
    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
</div>
</template>

<script>
import Message from './Message';
import { b64encode, b64decode } from '../libs/base64';
import { setTitle } from '../libs/utils';
import reg from '../libs/sharedRegistry';
import ddb from 'ddb';

export default {
  components: {
      Message
  },
  props: ["titleSuffix"],
  data: function(){
      return {
          loading: true,
          error: ""
      }
  },
  mounted: async function(){
    let ds, path;
    const standalone = this.$route.params.encodedPath !== undefined;

    if (standalone){
        ds = reg.Organization(this.$route.params.org)
                                .Dataset(this.$route.params.ds);
        // Load file info from network
        path = b64decode(this.$route.params.encodedPath);
        this.$parent.ddbURI = ds.remoteUri(path);
    }else if (this.$parent.uri){
        [ds, path] = ddb.utils.datasetPathFromUri(this.$parent.uri);
        this.$parent.ddbURI = this.$parent.uri;
    }else{
        this.error = "Invalid uri";
        return;
    }

    try{
        const entry = await ds.listOne(path);
        this.$parent.entry = entry;
        this.$parent.dataset = ds;
        if (this.$route.params.encodedPath){
            const $header = this.$parent.$parent.$children[0];
            $header.selectedFiles = [{path: this.$parent.ddbURI}];
            setTitle(`${ddb.pathutils.basename(entry.path)} - ${this.titleSuffix}`);
        }
    }catch(e){
        this.error = e.message;
    }

    this.loading = false;
    if (!this.error) this.$emit("loaded");
  }
}
</script>

<style scoped>
.loading{
    padding: 12px;
    text-align: center;
}
.message.warning{
    margin: 12px;
}
</style>
