<template>
<div id="userhome">
    <Message bindTo="error" />

    <h3>{{ $route.params.org }}</h3>

    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
        <div v-for="ds in datasets" class="ui segments datasets">
            <div class="ui segment">
                <div class="ui middle aligned divided list">
                    <div class="item">
                        <div class="right floated">
                            <button @click="handleRename(ds)" class="ui button icon small grey"
                                    :class="{loading: ds.renaming}"
                                    :disabled="ds.renaming">
                                    <i class="ui icon edit outline"></i>
                            </button>
                            <button @click.stop="handleDelete(ds)" class="ui button icon small negative" 
                                :class="{loading: ds.deleting}"
                                :disabled="ds.deleting"><i class="ui icon trash"></i></button>
                        </div>
                        
                        <a href="javascript:void(0)" @click.stop="viewDataset(ds)"><i class="large database icon"></i> {{datasetName(ds)}}</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<script>
import Message from 'commonui/components/Message.vue';
import ddb from 'ddb';
import { setTitle } from '../libs/utils';
import { renameDataset, datasetName } from '../libs/registryUtils';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message
    },
    data: function () {
        return {
            error: "",
            datasets: [],
            loading: true
        }
    },
    mounted: async function(){
        setTitle(this.$route.params.org);
        
        try{
            this.org = reg.Organization(this.$route.params.org);
            this.datasets = await this.org.datasets();
            this.datasets.sort((a, b) => new Date(a.creationDate).getTime() < new Date(b.creationDate).getTime() ? 1 : -1);
            if (this.datasets.length === 0){
                this.$router.push({name: "Upload"}).catch(()=>{});
            }
        }catch(e){
            if (e.message === "Unauthorized"){
                this.$router.push({name: "Login"}).catch(()=>{});
            }else{
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    methods: {
        datasetName,

        async handleDelete(ds){
            if (window.confirm(`Are you sure you want to delete ${ds.slug}?`)){
                this.$set(ds, 'deleting', true);
                try{
                    if (await this.org.Dataset(ds.slug).delete()){
                        this.datasets = this.datasets.filter(d => d !== ds);
                    }
                }catch(e){
                    console.log(e.message);
                    this.error = e.message;
                }
                this.$set(ds, 'deleting', false);
            }
        },

        async handleRename(ds){
            // TODO: add proper modal
            var newName;

            if (newName = window.prompt("Enter new dataset name:", datasetName(ds))){
                this.$set(ds, 'renaming', true);
                try{
                    var newDs;
                    if (newDs = await renameDataset(this.$route.params.org, ds.slug, newName)){
                        ds.slug = newDs.slug;
                        ds.properties.meta.name = newDs.properties.meta.name;
                    }
                }catch(e){
                    console.log(e.message);
                    this.error = e.message;
                }
                this.$set(ds, 'renaming', false);
            }
        },

        viewDataset(ds){
            this.$router.push({name: "ViewDataset", params: {
                org: this.$route.params.org,
                ds: ds.slug 
            }});
        },

        upload: function(){
            this.$router.push({name: "Upload"});
        }
    }
}
</script>

<style scoped>
#userhome {
    margin: 12px;
    margin-top: 16px;
    padding-bottom: 16px;
    .datasets{
        a{
            font-size: 120%;
            position: relative;
            top: 2px;
        }
        i.database{
            color: #030A03;
        }
    }
}
</style>
