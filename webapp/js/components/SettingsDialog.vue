<template>
    <Window title="Settings" id="settings" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize
            fixedPosition
            closeModalOnClick>
    <Message bindTo="error" />

    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div class="content" v-else>
        <h4 class="ui header">
        <i class="icon" :class="{unlock: noAuthRequired, lock: !noAuthRequired}"></i>
        <div class="content">
            Visibility: <select v-model="visibility" @change="setVisibility">
                <option v-for="(v, k) in Visibilities" :value="k">{{ v.label }}</option>
            </select>
        </div>
        </h4>

        <div class="description" v-html="description">
        </div>

        <h4 class="ui header">
        <i class="icon balance scale"></i>
        <div class="content">
            License: <select style="text-overflow: ellipsis" :title="Licenses[license].name" class="license-dropdown" v-model="license" @change="setLicense">
                <option v-for="(v, k) in Licenses" :value="k">{{ v.name }}</option>
            </select>
        </div>
        </h4>
        
        <div class="extra" v-if="readme == null">
            <button @click="addDocument('README.md')" class="ui button basic icon">
                <i class="icon book"/> Add Readme
            </button>
        </div>
    </div>
</Window>
</template>

<script>
import Message from './Message.vue';
import mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import { Licenses } from '../libs/licenses';
import Window from './Window.vue';
import ddb from 'ddb';

export default {
    props: {
        dataset:{
            required: true,
            type: Object
        }
    },
    components: {
        Message, Window
    },
    data: function () {
        return {
            error: "",
            properties: null,
            loading: true,
            readme: null,
            license: "proprietary",
            Licenses,
            Visibilities: {
                [ddb.Visibility.PUBLIC]: { label: "Public" },
                [ddb.Visibility.UNLISTED]: { label: "Unlisted" },
                [ddb.Visibility.PRIVATE]: { label: "Private" }
            },
            visibility: ddb.Visibility.PRIVATE
        }
    },
    mounted: async function(){
        try{
            const info = await this.dataset.info();
            this.properties = info[0].properties;
        
            this.readme = (typeof this.properties.readme !== 'undefined') ? this.properties.readme : null;
            this.license = this.properties?.meta?.license?.data ?? 'proprietary';
            this.visibility = this.properties?.meta?.visibility?.data ?? ddb.Visibility.PRIVATE;

            console.log(this.Visibilities);
        }catch(e){
            this.error = e.message;
        }

        this.loading = false;
    },
    beforeDestroy: function(){
    },
    computed: {
        currentUrl: function(){
            return window.location.href;
        },
        noAuthRequired: function(){
            return [ddb.Visibility.PUBLIC, ddb.Visibility.UNLISTED].indexOf(this.visibility) !== -1;
        },
        description: function(){
            if (parseInt(this.visibility) === ddb.Visibility.PUBLIC){
                return `This dataset will be discoverable. Anybody with the <a href="${this.currentUrl}">link</a> to this page can also see and download the data`;
            }else if (parseInt(this.visibility) === ddb.Visibility.UNLISTED){
                return `Anybody with the <a href="${this.currentUrl}">link</a> to this page can see and download the data, but it will not be discoverable.`;
            }else{
                return `Only you and people in your organization can see and download the data.`;
            }
        }
    },
    methods: {
        close: function(buttonId){
          this.$emit('onClose', buttonId);
        },
        setVisibility: async function(){
            try{
                this.properties.meta.visibility = await this.dataset.setVisibility(this.visibility);
            }catch(e){
                this.error = e.message;
            }
        },
        setLicense: async function(){
            try{
                this.properties.meta.license = await this.dataset.metaSet("license", this.license);
            }catch(e){
                this.error = e.message;
            }
        },
        addDocument: async function(document) {
            
            this.loading = true;

            var entry = null;

            switch(document) {
                // case "LICENSE.md":
                //     entry = await this.dataset.writeObj(document, "# License\n");
                //     this.license = document;
                //     break;
                case "README.md":
                    entry = await this.dataset.writeObj(document, "\n");
                    this.readme = document;
                    break;
                default:
                    throw new Error("Invalid document: " + document);
            }

            this.$emit('addMarkdown', document, entry);

            this.loading = false;
        }
    }
}
</script>

<style scoped>
#settings{
    min-height: 200px;
    padding: 8px;
    margin-top: 12px;
    .content{
        padding: 4px 8px 8px 8px;
        margin-bottom: 32px;
    }
    .loading{
        text-align: center;
        padding: 16px;
    }
    .ui.header{
        padding-top: 6px;
    }
    .visibility{
        font-size: 110%;
    }
    .description{
        font-size: 90%;
        margin-top: 12px;
        max-width: 400px;
    }
    a{
        text-decoration: underline;
    }
    .extra {
        margin-top: 12px;
        .button{
            color: #030A03 !important;
        }
    }

    .license-dropdown{
        max-width: 250px;
    }
}
</style>
