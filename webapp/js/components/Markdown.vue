<template>
    <div class="markdown">
        <Message bindTo="error" />
        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div v-else class="md-container">
            <div v-if="editing && editable" class="edit-container">
                <textarea ref="editTextarea" v-model="rawContent"></textarea>
                <button @click="save" class="ui basic button secondary icon save"><i class="icon save" /></button>
            </div>
            <template v-else>
                <button v-if="editable" @click="edit" class="ui basic button secondary icon edit"><i class="icon edit" /></button>
                <div v-html="content" class="content" />
            </template>
        </div>
    </div>
</template>

<script>
import Message from './Message';
import ddb from 'ddb';
import MarkdownIt from 'markdown-it';

export default {
  components: {
      Message
  },
  props: {
      uri: { // DDB uri
          type: String,
          required: true
      },
      editable: {
          type: Boolean,
          required: false,
          default: true
      }
  },
  data: function(){
      return {
          loading: true,
          error: "",
          content: "",
          rawContent: "",
          editing: false,
      }
  },

  mounted: async function(){
      const [dataset, path] = ddb.utils.datasetPathFromUri(this.uri);
      this.dataset = dataset;
      this.path = path;

      try{
        this.rawContent = await dataset.getFileContents(path);
        this.updateMarkdown();
      }catch(e){
        this.error = `Cannot fetch ${this.uri}: ${e}`;
      }
      this.loading = false;
  },

  methods: {
      updateMarkdown: function(){
        const md = new MarkdownIt();
        this.content = md.render(this.rawContent);
      },

      edit: function(){
          this.editing = true;
          this.$nextTick(() => {
              this.$refs.editTextarea.focus();
              this.$refs.editTextarea.scrollTo(0, 0);
          });
      },

      save: async function(){
          this.loading = true;
          try{
            await this.dataset.writeObj(this.path, this.rawContent);
            this.updateMarkdown();
            this.editing = false;
          }catch(e){
              this.error = e.message;
          }finally{
              this.loading = false;
          }
      }
      
  }
}
</script>

<style>
.markdown{
    .loading{
        margin-top: 12px;
        text-align: center;
    }

    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;

    .md-container{
        height: 100%;

        .edit-container{
            position: relative;
            height: 100%;
            display: flex;
        }
        
        button.edit{
            float: right;
            margin: 10px;
        }

        button.save{
            position: absolute;
            top: 10px;
            right: 7px;
        }

        textarea{
            padding: 12px;
            width: 100%;
            flex-grow: 1;
            border: none;
            resize: none;
            font-family: monospace;
            outline: none;
        }
    }
    .content{
        padding: 12px;
        img{
            max-width: 100%;
        }
    }
}
</style>