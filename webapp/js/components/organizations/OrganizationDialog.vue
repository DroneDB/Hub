<template>
    <Window v-bind:title="title" id="organizationDialog" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        <div class="ui form">
            <div class="fields">
                <div class="seven wide field">
                    <label>Slug</label>
                    <input type="text" v-model="org.slug" :disabled="mode == 'edit'" placeholder="Slug" />
                </div>
                <div class="seven wide field">
                    <label>Name</label>
                    <input type="text" v-model="org.name" placeholder="Name" />
                </div>
            </div>
            <div class="field">
                <label>Description</label>
                <textarea v-model="org.description" placeholder="Description"></textarea>
            </div>
            <div class="inline field">
                <label>Public</label>
                <input type="checkbox" v-model="org.isPublic" />
            </div>
        </div>        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button v-if="mode == 'new'" @click="close('create', org)" class="ui button primary" :disabled="!isValid()">
                Create
            </button>
            <button v-else @click="close('save', org)" class="ui button primary" :disabled="!isValid()">
                Save
            </button>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';

export default {
    components: {
        Window
    },

    props: ["mode", "model"],
  
    data: function(){
        return {
            org: {
                slug: null,
                name: null,
                description: null,
                isPublic: false
            },
            title: null
        };
    },
    mounted: function() { 

        if (this.mode == 'edit') {

            this.title = "Edit organization " + this.model.slug;

            this.org.slug = this.model.slug;
            this.org.name = this.model.name;
            this.org.description = this.model.description;
            this.org.isPublic = this.model.isPublic;
        } else {

            this.title = "Create new organization";

            this.org.slug = null;
            this.org.name = null;
            this.org.description = null;
            this.org.isPublic = false;
        }

    },
    methods: {
        close: function(buttonId, obj){
            this.$emit('onClose', buttonId, obj);
        },
        isValid: function(){

            // organization slug can contain only letters, numbers, dashes and underscores
            var re = /^[a-zA-Z0-9\-_]+$/;

            return this.org.slug && re.test(this.org.slug) && this.org.name;
        }
    }
}
</script>

<style scoped>
.buttons{
    margin-top: 16px;
    text-align: right;
}
.form {
    margin-bottom: 20px;
}
</style>