<template>
<div class="settings">
    <Message bindTo="error" />

    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
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
    </div>

<!--
<h4 class="ui header">
  <i class="key icon"></i>
  <div class="content">
    Password: not set
  </div>
</h4>-->

<div class="description" v-if="isPublic">
Anybody with the <a :href="currentUrl">link</a> to this page can see and download the data.
</div>
<div class="description" v-else>
Only you and people in your organization can see and download the data. 
</div>

<div class="extra" v-if="readme == null">
    <button @click="addReadme()" class="ui button">
        Add readme
    </button>
</div>
<div class="extra" v-if="license == null">
    <button @click="addLicense()" class="ui button">
        Add license
    </button>
</div>

</div>
</template>

<script>
import Message from 'commonui/components/Message.vue';
import mouse from 'commonui/mouse';

export default {
    props: {
        dataset:{
            required: true,
            type: Object
        }
    },
    components: {
        Message
    },
    data: function () {
        return {
            error: "",
            meta: null,
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
            this.meta = info[0].meta;
            
            this.readme = (typeof this.meta.readme !== 'undefined') ? this.meta.readme : null;
            this.license = (typeof this.meta.license !== 'undefined') ? this.meta.license : null;

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
            return this.meta && this.meta.public;
        }
    },
    methods: {
        toggleVisibilityMenu: function(){
            if (this.$refs.visibilityMenu) this.$refs.visibilityMenu.style.display = this.$refs.visibilityMenu.style.display === 'block' ? 
                                                        'none' : 'block';
        },
        hideVisibilityMenu: function(){
            if (this.$refs.visibilityMenu) this.$refs.visibilityMenu.style.display = 'none';
        },
        setPublic: async function(flag){
            try{
                this.meta = await this.dataset.setPublic(flag);
            }catch(e){
                this.error = e.message;
            }
        }
    }
}
</script>

<style scoped>
.settings{
    min-height: 200px;
    padding: 8px;
    margin-top: 12px;
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
    }
}
</style>
