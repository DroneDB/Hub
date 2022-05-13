<template>
    <div class="thumbnail"
        :class="{selected: file.selected}"
        :title="error ? error : file.path"
        :style="{'maxWidth': size + 'px'}"
        @click="onClick"
        @contextmenu="onRightClick"
        @dblclick="onDblClick">
        <div class="container" :class="{bordered: thumbnail !== null}"
            :style="sizeStyle">
            <img v-if="!icon" :class="{hide: thumbnail !== null && loading}" @load="imageLoaded" @error="handleImageError" :src="thumbnail" />
            <i v-if="icon && !loading" class="icon icon-file " :class="icon" :style="iconStyle" />
            <i class="icon circle notch spin loading" v-if="loading || (thumbnail === null && icon === null)" />
        </div>
        {{label}}
    </div>
</template>

<script>
import { thumbs, pathutils } from 'ddb';
import Mouse from '../libs/mouse';
import Keyboard from '../libs/keyboard';

export default {
  components: {
  },
  props: {
      file: {
          type: Object,
          required: true
      },
      size: {
          type: Number,
          required: false,
          default: 128
      },
      lazyLoad: {
          type: Boolean,
          default: false
      }
  },
  data: function(){
      const label = this.file.label;

      return {
          label,
          thumbnail: null,
          icon: null,
          error: null,
          iconStyle: {
            fontSize: parseInt(this.size / 3) + 'px'
          },
          sizeStyle: {
              width: this.size + 'px',
              height: this.size + 'px'
          },
          loading: false
      }
  },
  mounted: async function(){
      if (!this.lazyLoad) await this.loadThumbnail();
  },
  methods: {
      imageLoaded: function(){
          this.loading = false;
      },
      getBoundingRect: function(){
          return this.$el.getBoundingClientRect();
      },
      handleImageError: function(e){
        // Retry
        if (!this.retryNumber) this.retryNumber = 0;

        if (this.retryNumber < 1000 && this.thumbnail.startsWith("/orgs")){
            if (this.loadTimeout){
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }
            this.loadTimeout = setTimeout(() => {
                if (this.retryNumber > 0 && this.thumbnail.endsWith(`&retry=${this.retryNumber}`)){
                    this.thumbnail = this.thumbnail.replace(new RegExp("&retry="+ this.retryNumber) + "$", `&retry=${this.retryNumber + 1}`);
                }else{
                    this.thumbnail += "&retry=1";
                }
                this.retryNumber += 1;
            }, 5000);
        }else{
            this.showError(new Error("Cannot load thumbnail (retries exceeded)"));
        }
      },
      showError: function(e){
        console.warn(e);
        this.error = e.message;
        this.icon = "exclamation triangle";
        this.loading = false;
      },
      loadThumbnail: async function(){
        if (this.loadingThumbnail) return; // Already loading
        if (this.thumbnail && !this.error) return; // Already loaded
        if (this.error) return; // TODO: is there a way to retry? Need to re-add the <img> tag to the DOM and retrigger load

        this.loadingThumbnail = true;

        try{
            if (thumbs.supportedForType(this.file.entry.type)){
                this.loading = true;
                this.thumbnail = await thumbs.fetch(this.file.path);
            }else{
                this.icon = this.file.icon;
            }
            this.loadingThumbnail = false;
        }catch(e){
            this.loadingThumbnail = false;
            this.showError(e);
        }
      },
      onClick: function(e){
          Keyboard.updateState(e);
          this.$emit('clicked', this, Mouse.LEFT);
      },
      onRightClick: function(e){
          Keyboard.updateState(e);
          this.$emit('clicked', this, Mouse.RIGHT);
      },
      onDblClick: function(){
        this.$emit("open", this);
      }
  }
}
</script>

<style scoped>
.thumbnail{
    margin: 2px;
    padding-top: 6px;
    padding-bottom: 6px;
    text-align: center;
    word-break: break-all;
    border-radius: 4px;
    transition: 0.25s background-color ease;
    &:hover{
        background: #eee;
        cursor: pointer;
    }
    &:focus,&:active{
        background: #dadada;
    }
    &.selected{
        background: #ddd;
    }
    .container{
        display: flex;
        align-items: flex-end;
        justify-content: center;
        position: relative;
        pointer-events: none;
        .bordered{
            box-shadow: 2px 2px 6px -2px #030A03;
        }
        img{
            padding-right: 8px;
            padding-left: 8px;
            max-width: 100%;
            max-height: 100%;
            &.hide{
                visibility: hidden;
            }
        }
        margin-bottom: 4px;
        i.icon-file{
            display: inline-block;
            margin-top: auto;
        }
    }
    .icon.badge{
        font-size: 11px;

    }

    i.loading{
        position: absolute;
        top: 50%;
    }
}
</style>