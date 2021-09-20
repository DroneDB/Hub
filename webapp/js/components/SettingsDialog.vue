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
        <i class="icon" :class="{unlock: isPublic, lock: !isPublic}"></i>
        <div class="content">
            Visibility:
            <div class="ui inline dropdown" @click.stop="toggleVisibilityMenu">
            
            <div class="text" v-if="isPublic">public</div>
            <div class="text" v-if="!isPublic">private</div>
            
            <i class="dropdown icon"></i>
            <div class="menu" ref="visibilityMenu">
                <div class="item" :class="{active: isPublic}" @click="setPublic(true)">public</div>
                <div class="item" :class="{active: !isPublic}" @click="setPublic(false)">private</div>
            </div>
            </div>
        </div>
        </h4>

        <div class="description" v-if="isPublic">
        Anybody with the <a :href="currentUrl">link</a> to this page can see and download the data.
        </div>
        <div class="description" v-else>
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
import Message from 'commonui/components/Message.vue';
import mouse from 'commonui/mouse';
import { clone } from 'commonui/classes/utils';
import Window from 'commonui/components/Window.vue';

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
        // TODO: add code to handle dropdowns in commonui
        // duplication here and in Header.vue to handle show
        // click, toggle, etc.
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
        isPublic: function(){
            return this.properties && this.properties.public;
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
        setPublic: async function(flag){
            try{
                this.properties = await this.dataset.setPublic(flag);
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
