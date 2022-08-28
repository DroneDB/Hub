<template>
    <Window title="" 
            id="share-embed" 
            modal
            fixedSize
            @onClose="$emit('onClose')">
        <div class="content">
            <Message bindTo="error" noDismiss />
            <i v-if="loading" class="icon circle notch spin" />
            <div class="share-type" v-else>
                <label for="share-mode">Share: </label> <select id='share-mode' v-model="shareMode">
                    <option v-for="(v, k) in shareModes" :value="k">
                        {{ v.label }}
                    </option>
                </select>
            </div>

            <div v-if="shareMode === 'qgis'">
                <template v-if="url !== ''">
                    <div class="ui icon positive message" v-if="!error">
                        <i class="cloud upload icon"></i> 
                        <div class="content">
                            <div class="header">
                            From QGIS
                            </div>
                            <div v-if="typeIs('POINTCLOUD')">
                                Layer <i class="arrow right icon"></i> Add Point Cloud Layer <i class="arrow right icon"></i> Source Type Protocol: HTTP(s) <i class="arrow right icon"></i> copy/paste the URL below.
                            </div>
                            <div v-if="typeIs('GEORASTER')">
                                Layer <i class="arrow right icon"></i> Add Raster Layer <i class="arrow right icon"></i> Source Type Protocol: HTTP(s) <i class="arrow right icon"></i> copy/paste the URL below.
                            </div>
                            <div class="auth-note" v-if="needsAuth">
                                <i class="lock icon"></i> For Authentication choose Basic and use your username and password.
                            </div>
                        </div>
                    </div>
                    <div class="ui action input fluid">
                        <input type="text" readonly :value="url" @click="copyToClipboard" title="Copy to clipboard"/>
                        <button class="ui icon button teal" @click="copyToClipboard" title="Copy to clipboard">
                            <i :class="copyIcon" class="icon"></i>
                        </button>
                    </div>
                </template>
                <template v-else>
                    <div class="ui icon info message">
                        <div class="content">
                            <div class="header">
                            Not supported
                            </div>
                            This file cannot be streamed directly into QGIS (download it instead).
                        </div>
                    </div>
                </template>
            </div>

            <div v-if="shareMode === 'link' || shareMode === 'tms' || shareMode === 'embed'">
                <div v-if="needsAuth">
                    <a href="javascript:void(0);"
                        @click="handleSetUnlisted"
                        class="ui button primary icon">
                            <i class="icon unlock"></i> Allow access to anyone with the link
                    </a>
                </div>
                <div v-else class="ui action input fluid">
                    <div class="ui icon info message" v-if="!url">
                        <div class="content">
                            <div class="header">
                            Not supported
                            </div>
                            This file does not support this type of sharing.
                        </div>
                    </div>
                    <template v-else>
                        <template v-if="shareMode === 'embed'">
                            <textarea readonly v-html="url" @click="copyToClipboard">
                            </textarea>
                        </template>
                        <template v-else>
                            <input type="text" readonly :value="url" @click="copyToClipboard" title="Copy to clipboard"/>
                        </template>
                        <button class="ui icon button teal" @click="copyToClipboard" title="Copy to clipboard">
                            <i :class="copyIcon" class="icon"></i>
                        </button>
                    </template>
                </div>
            </div>

        </div>
    </Window>
</template>

<script>
import Window from './Window';
import Message from './Message';
import copy from 'clipboard-copy';
import ddb from 'ddb';

import { OpenItemDefaults } from '../libs/openItemDefaults';
import { b64encode } from '../libs/base64';

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
          needsAuth: false,
          buildUrl: null,
          shareMode: "link",
          entry: null,
          dataset: null,
          shareModes: {
            'link': {
                label: "Link"
            },
            'embed': {
                label: 'Embed'
            },
            'tms': {
                label: "TMS"
            },
            'qgis': {
                label: "QGIS"
            }
          }
      };
  },
  mounted: async function(){
      try{
          const [ dataset, _ ] = ddb.utils.datasetPathFromUri(this.file.path);
          this.needsAuth = (await dataset.getVisibility()) === ddb.Visibility.PRIVATE;
          const entry = dataset.Entry(this.file.entry);

          if (entry.type === ddb.entry.type.POINTCLOUD) this.buildUrl = await entry.getEpt();
          else if (entry.type === ddb.entry.type.GEORASTER) this.buildUrl = await entry.getCog();

          this.entry = entry;  
          this.dataset = dataset;  
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
      handleSetUnlisted: async function(){
        try{
            this.loading = true;
            await this.dataset.setVisibility(ddb.Visibility.UNLISTED);
            this.needsAuth = false;
        }catch(e){
            this.error = e.message;
        }
        this.loading = false;
      },
      typeIs: function(t){
          return this.file.entry.type === ddb.entry.type[t];
      }
  },

  computed: {
    url: function(){
        let baseUrl = `${window.location.protocol}//${window.location.host}`;
        
        if (this.shareMode === 'qgis' && this.buildUrl){
            return `${baseUrl}${this.buildUrl}`;
        }else if (['link', 'embed'].indexOf(this.shareMode) !== -1 && this.entry){
            let view = OpenItemDefaults[this.entry.type];
            if (view){
                let url = `${baseUrl}/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(this.entry.path)}/${view}`;
                if (this.shareMode === 'embed'){
                    url += '?embed=1';
                    // Not really a URL...
                    url = `<iframe frameborder="0" width="600" height="400" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="fullscreen" src="${url}"></iframe>`;
                }
                return url;
            }else if (this.shareMode === 'link'){
                return baseUrl + this.dataset.downloadUrl(this.entry.path, { inline: true });
            }else{
                return '';
            }
        }else if (this.shareMode === 'tms' && this.entry){
            if ([ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.GEOIMAGE].indexOf(this.entry.type) !== -1){
                return baseUrl + this.dataset.tileUrl(this.entry.path, "{z}", "{x}", "{y}");
            }else{
                return '';
            }
        }else{
            return '';
        }
    }
  }
}
</script>

<style scoped>
textarea{
    width: 100%;
    height: 100px;
}
.share-type{
    margin-bottom: 12px;
}
label{
    font-weight: bold;
}
.content{
    width: 420px;
}
.auth-note{
    margin-top: 8px;
}
</style>