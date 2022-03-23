<template>
<div id="datasets">
    <Message bindTo="error" />

    <div class="top-banner ui equal width grid middle aligned">
        <div class="column">
            <h1>{{ $route.params.org }}</h1>
            <p>Organizations are groups of datasets managed by a single owner.</p>
        </div>
        <div class="column right aligned">
            <button @click.stop="handleNew()" class="ui primary button icon"><i class="ui icon add"></i>&nbsp;Create Dataset</button>
        </div>
    </div>
    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>

    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
        <div v-for="ds in datasets" class="ui segments datasets">
            <div class="ui segment" @click="viewDataset(ds)">
                <div class="ui grid middle aligned flex-container">
                    <div class="flex-item column left aligned main-col"><i class="large database icon"></i>{{ds.slug}}</div>
                    <div class="flex-item column left aligned">{{org.name ? org.name : '—'}}</div>
                    <div class="flex-item column left aligned">
                        <span v-if="ds.entries == 0">—</span>
                        <div v-else><div style="margin-bottom: 5px">{{ds.entries}} <span v-if="ds.entries > 1">files</span><span v-else>file</span></div><div>{{bytesToSize(ds.size)}}</div></div>
                    </div>
                    <div class="flex-item column left aligned">
                        <div v-if="ds.public"><i class="large globe icon"></i>Public</div>
                        <div v-else><i class="large lock icon"></i>Private</div>
                    </div>
                    <div class="flex-item column actions right aligned">
                        <button @click.stop="handleEdit(ds)" class="ui button icon small grey"
                                    :class="{loading: ds.editing}"
                                    :disabled="ds.editing">
                                    <i class="ui icon pencil"></i>
                        </button>                        
                        <button @click.stop="handleDelete(ds)" class="ui button icon small negative" 
                                :class="{loading: ds.deleting}"                                
                                :disabled="ds.deleting"><i class="ui icon trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
        
    <DeleteDatasetDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :dsSlug="currentDsSlug"></DeleteDatasetDialog>
    <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
    <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" @onClose="handleDatasetClose"></DatasetDialog>

</div>
</template>

<script>
import Message from '../Message.vue';
import ddb from 'ddb';
import { setTitle, bytesToSize } from '../../libs/utils';
import { renameDataset, datasetName } from '../../libs/registryUtils';
import DeleteDatasetDialog from './DeleteDatasetDialog.vue';
import DatasetDialog from './DatasetDialog.vue';
import MessageDialog from '../common/MessageDialog.vue'

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message,
        DeleteDatasetDialog,
        MessageDialog,
        DatasetDialog
    },
    data: function () {
        return {
            error: "",
            datasets: [],
            loading: true,
            deleteDialogOpen: false,
            currentDsSlug: null,
            messageDialogOpen: false,
            currentMessage: null,            

            dsDialogModel: null,
            dsDialogMode: null,
            dsDialogOpen: false,
        }
    },
    mounted: async function(){
        setTitle(this.$route.params.org);
        
        try {

            this.org = reg.Organization(this.$route.params.org);
            const tmp = await this.org.datasets();

            this.datasets = tmp.map(ds => {
                return {
                    slug: ds.slug,
                    creationDate: Date.parse(ds.creationDate),                    
                    public: ds.properties.public,
                    entries: ds.properties.entries,
                    size: ds.size,
                    editing: false,
                    deleting: false,
                    name: ds.properties && ds.properties.meta && ds.properties.meta.name && ds.properties.meta.name.data
                };
            });

            this.datasets.sort((a, b) => new Date(a.creationDate).getTime() < new Date(b.creationDate).getTime() ? 1 : -1);
            if (this.datasets.length === 0){
                this.$router.push({name: "Upload"}).catch(()=>{});
            }
        } catch(e) {
            if (e.message === "Unauthorized"){
                this.$router.push({name: "Login"}).catch(()=>{});
            } else {
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    methods: {
        bytesToSize,
        datasetName,

        handleDelete(ds) {
            this.currentDsSlug = ds.slug;
            this.deleteDialogOpen = true;
        },

        async handleDeleteClose(res) {
            this.deleteDialogOpen = false;

            if (res == "close") {
                this.currentDsSlug = null;
                return;
            }

            let ds = this.datasets.find(o => o.slug == this.currentDsSlug);
            ds.deleting = true;

            try {
                
                let ret = await this.org.Dataset(this.currentDsSlug).delete()

                if (ret) {
                    this.datasets = this.datasets.filter(o => o.slug !== this.currentDsSlug);
                } else {
                    this.error = "Failed to delete dataset \"" + this.currentDsSlug + "\"";
                    console.error(ret);
                    ds.deleting = false;
                }
            } catch(e) {
                console.error(e);
                this.error = "Failed to delete dataset: " + e.message;
                ds.deleting = false;
            }

        },

        /* missing handleOrganizationClose and datasetDialog impl */

        showMessage(msg) {
            this.currentMessage = msg;
            this.messageDialogOpen = true;
        },        

        handleMessageClose() {
            this.messageDialogOpen = false;
            this.currentMessage = null;
        },

        handleEdit(ds) {
            this.editDataset(ds);
        },

        editDataset(ds) {
            this.dsDialogModel = {
                slug: ds.slug,
                name: ds.name,    
                isPublic: ds.public
            };
            this.dsDialogMode = "edit";
            this.dsDialogOpen = true;
        },
        
        newDataset() {
            this.dsDialogMode = "new";
            this.dsDialogOpen = true;
        },

        handleNew() {
            this.newDataset();
        },
/*
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
        },*/

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
#datasets {

    .top-banner {
        margin-top: 30px;
        margin-bottom: 40px;
    }

    margin: 12px;
    margin-top: 16px;
    padding-bottom: 16px;
    /*
    .datasets{
        a{
            font-size: 120%;
            position: relative;
            top: 2px;
        }
        i.database{
            color: #030A03;
        }
    }*/

    .datasets {

        .segment {
            &:hover {
                background-color: #f5f5f5;
                cursor: pointer;
            }
        }
       
        .column {
            font-size: large;
        }
        i.icon {
                margin-right: 5px;
        }
        .main-col {
            font-weight: bold;
            i.icon {
                margin-right: 20px;
            }
        }
        .item {
            display: flex;
            justify-content: space-between;
            align-items: center;            
        }

    }

    .flex-container {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: space-between;
        align-content: stretch;
        align-items: flex-start;
    }

    .flex-item:nth-child(1) {
        order: 0;
        flex: 1 1 100px;
        align-self: auto;

        @media screen and (max-width: 576px) {
            flex-grow: 0;
            text-align: center;

            i.icon {
                margin-right: 0;
            }
        }

    }

    .flex-item:nth-child(2) {
        order: 0;
        flex: 1 1 auto;
        align-self: auto;
    }

    .flex-item:nth-child(3) {
        order: 0;
        flex: 1 1 auto;
        align-self: auto;

        @media screen and (max-width: 576px) {
            display: none;
        }

    }

    .flex-item:nth-child(4) {
        order: 0;
        flex: 0.5 1 auto;
        align-self: auto;

        
        @media screen and (max-width: 768px) {
            text-align: center;
            
            i.icon {
                margin-right: 0;
            }
        }

        @media screen and (max-width: 576px) {
            display: none;
        }
    }

    .flex-item:nth-child(5) {
        order: 0;
        flex: 0.5 1 100px;
        align-self: auto;
    }
}
</style>
