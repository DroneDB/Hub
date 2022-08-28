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
            Visibility:
            <div class="ui inline dropdown" @click.stop="toggleVisibilityMenu">
            
            <div class="text" v-if="isPublic">public</div>
            <div class="text" v-if="isUnlisted">unlisted</div>
            <div class="text" v-if="isPrivate">private</div>
            
            <i class="dropdown icon"></i>
            <div class="menu" ref="visibilityMenu">
                <div class="item" :class="{active: isPublic}" @click="setVisibility(2)">public</div>
                <div class="item" :class="{active: isUnlisted}" @click="setVisibility(1)">unlisted</div>
                <div class="item" :class="{active: isPrivate}" @click="setVisibility(0)">private</div>
            </div>
            </div>
        </div>
        </h4>

        <div class="description" v-if="isPublic">
        This dataset will be discoverable. Anybody with the <a :href="currentUrl">link</a> to this page can also see and download the data 
        </div>
        <div class="description" v-if="isUnlisted">
        Anybody with the <a :href="currentUrl">link</a> to this page can see and download the data, but it will not be discoverable.
        </div>
        <div class="description" v-if="isPrivate">
        Only you and people in your organization can see and download the data. 
        </div>

        <div class="extra" v-if="readme == null">
            <button @click="addDocument('README.md')" class="ui button basic icon">
                <i class="icon book"/> Add Readme
            </button>
        </div>
        <div class="extra" v-if="license == null">
            <button @click="addDocument('LICENSE.md')" class="ui button basic icon">
                <i class="icon balance scale" /> Add License
            </button>
        </div>
    </div>
</Window>
</template>

<script>
import Message from './Message.vue';
import mouse from '../libs/mouse';
import { clone } from '../libs/utils';
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
            license: null
        }
    },
    mounted: async function(){
        mouse.on("click", this.hideVisibilityMenu);


        try{
            const info = await this.dataset.info();
            this.properties = info[0].properties;
        
            this.readme = (typeof this.properties.readme !== 'undefined') ? this.properties.readme : null;
            this.license = (typeof this.properties.license !== 'undefined') ? this.properties.license : null;

        }catch(e){
            this.error = e.message;
        }

        this.loading = false;
    },
    beforeDestroy: function(){
        mouse.off("click", this.hideVisibilityMenu);
    },
    computed: {
        currentUrl: function(){
            return window.location.href;
        },
        noAuthRequired: function(){
            return this.isPublic || this.isUnlisted;
        },
        isPublic: function(){
            return this.properties?.meta?.visibility?.data === ddb.Visibility.PUBLIC;
        },
        isUnlisted: function(){
            return this.properties?.meta?.visibility?.data === ddb.Visibility.UNLISTED;
        },
        isPrivate: function(){
            return this.properties?.meta?.visibility?.data === ddb.Visibility.PRIVATE || !(this.properties?.meta?.visibility?.data);
        }
    },
    methods: {
        close: function(buttonId){
          this.$emit('onClose', buttonId);
        },
        toggleVisibilityMenu: function(){
            if (this.$refs.visibilityMenu) this.$refs.visibilityMenu.style.display = this.$refs.visibilityMenu.style.display === 'block' ? 
                                                        'none' : 'block';
        },
        hideVisibilityMenu: function(){
            if (this.$refs.visibilityMenu) this.$refs.visibilityMenu.style.display = 'none';
        },
        setVisibility: async function(v){
            try{
                this.properties.meta.visibility = await this.dataset.setVisibility(v);
            }catch(e){
                this.error = e.message;
            }
        },
        addDocument: async function(document) {
            
            this.loading = true;

            var entry = null;

            switch(document) {
                case "LICENSE.md":
                    entry = await this.dataset.writeObj(document, "# License\n");
                    this.license = document;
                    break;
                case "README.md":
                    entry = await this.dataset.writeObj(document, "# Readme\n");
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
}
</style>
