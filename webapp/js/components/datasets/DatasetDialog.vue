<template>
    <Window v-bind:title="title" id="datasetDialog" @onClose="close('close')" 
            modal
            maxWidth="70%"
            fixedSize>

        <form class="ui form">
            <div class="field">
                <label>Slug</label>
                <input type="text" pattern="[a-z0-9_]+" required v-model="ds.slug" @keydown="filterKeys($event)" placeholder="Slug" />
            </div>
            <div class="field">
                <label>Name</label>
                <input type="text" v-model="ds.name" placeholder="Name" />
            </div>
            <div class="inline field">
                <label>Public</label>
                <input type="checkbox" v-model="ds.isPublic" />
            </div>
        </form>        
        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button v-if="mode == 'new'" @click="close('create', ds)" class="ui button primary" :disabled="!isValid()">
                Create
            </button>
            <button v-else @click="close('save', ds)" class="ui button primary" :disabled="!isValid()">
                Save
            </button>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';


var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window
    },

    props: ["mode", "model"],
  
    data: function(){
        return {
            ds: {
                slug: null,
                name: null,
                isPublic: false
            },
            title: null
        };
    },
    mounted: function() { 

        if (this.mode == 'edit') {

            this.title = "Edit dataset " + this.model.slug;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.isPublic = this.model.isPublic;
        } else {

            this.title = "Create new dataset";

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.isPublic = false;
        }

    },
    methods: {
        filterKeys(e) {

            // Allow backspace, canc, left arrow, right arrow and tab
            if (e.keyCode == 8 || e.keyCode == 46 || e.keyCode == 37 || e.keyCode == 39 || e.keyCode == 9) {
                return;
            }

            // Allow only lowercase letters and numbers
            if (!re.test(e.key)) {
                e.preventDefault();
            }
        },
        close: function(buttonId, obj){
            this.$emit('onClose', buttonId, obj);
        },
        isValid: function(){

            // organization slug can contain only letters, numbers, dashes and underscores
            return this.ds.slug && re.test(this.ds.slug) && this.ds.name;
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

.fields .field:first-child {
    padding-left: 0px;
}


.fields .field:last-child {
    padding-right: 0px;
}

.ui.form .fields {
    margin-left: 0;
    margin-right: 0;
}

.content {
    overflow: hidden;
}
</style>