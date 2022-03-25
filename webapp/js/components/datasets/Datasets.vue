<template>
<div id="datasets">
    <Message bindTo="error" />

    <div class="top-banner ui equal width grid middle aligned">
        <div class="column">
            <h1>{{ $route.params.org }}</h1>
            <p>Datasets are the DroneDB databases that belong to this organization.</p>
        </div>
        <div class="column right aligned">
            <button @click.stop="handleNew()" class="ui primary button icon"><i class="ui icon add"></i>&nbsp;Create Dataset</button>
        </div>
    </div>
    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
        <div v-for="ds in datasets" class="ui segments datasets">
            <div class="ui segment" @click="viewDataset(ds)">
                <div class="ui grid middle aligned flex-container">
                    <div class="flex-item column left aligned main-col"><i class="large database icon"></i>{{ds.slug}}</div>
                    <div class="flex-item column left aligned">{{ds.name ? ds.name : '—'}}</div>
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
                                    :disabled="ds.editing || ds.deleting">
                                    <i class="ui icon pencil"></i>
                        </button>                        
                        <button @click.stop="handleDelete(ds)" class="ui button icon small negative" 
                                :class="{loading: ds.deleting}"                                
                                :disabled="ds.deleting || ds.editing"><i class="ui icon trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div v-if="datasets.length == 0" class="ui segment">
            <div class="ui grid middle aligned">
                <div class="column">
                    <h3>No datasets found</h3>
                    <p>You can create a new dataset by clicking the create dataset button.</p>
                </div>
            </div>
        </div>
    </div>
        
    <DeleteDatasetDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :dsSlug="currentDsSlug"></DeleteDatasetDialog>
    <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
    <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbiddenSlugs="forbiddenSlugs" @onClose="handleDatasetClose"></DatasetDialog>

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
            dsDialogOpen: false        
        }
    },
    mounted: async function(){
        setTitle(this.$route.params.org);
        
        try {

            this.org = reg.Organization(this.$route.params.org);
            const tmp = await this.org.datasets();

            this.datasets = tmp.map(ds => {
                console.log(ds);
                return {
                    slug: ds.slug,
                    creationDate: Date.parse(ds.creationDate),                    
                    public: ds.properties.public,
                    entries: ds.properties.entries,
                    size: ds.size,
                    editing: false,
                    deleting: false,
                    name: ds.properties?.meta?.name?.data
                };
            });

            this.datasets.sort((a, b) => new Date(a.creationDate).getTime() < new Date(b.creationDate).getTime() ? 1 : -1);
            /*if (this.datasets.length === 0){
                this.$router.push({name: "Upload"}).catch(()=>{});
            }*/
        } catch(e) {
            if (e.message === "Unauthorized"){
                this.$router.push({name: "Login"}).catch(()=>{});
            } else {
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    computed: {
        forbiddenSlugs: function(){
            return this.datasets.map(ds => ds.slug);
        }    
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
    
        async handleDatasetClose(res, newds) {

            this.dsDialogOpen = false;

            if (res == "close") {
                this.dsDialogModel = null;
                return;
            }

            if (this.dsDialogMode == "new") {
                this.dsDialogModel = null;
                this.dsDialogOpen = false;
                this.loading = true;

                try {
                    let ret = await this.org.createDataset(newds.slug, newds.name, newds.isPublic);
                    if (ret) {
                        this.datasets.push({
                            slug: newds.slug,
                            creationDate: new Date(),                    
                            public: newds.isPublic,
                            entries: 0,
                            size: 0,
                            editing: false,
                            deleting: false,
                            name: newds.name
                        });
                    } else {
                        this.error = "Failed to create dataset \"" + newds.slug + "\"";
                        console.error(ret);
                    }
                } catch(e) {
                    console.error(e);
                    this.error = "Failed to create dataset: " + e.message;
                }
                this.loading = false;

            } else if (this.dsDialogMode == "edit") {
                let ds = this.dsDialogModel;
                this.dsDialogModel = null;
                this.dsDialogOpen = false;
                this.loading = true;

                let dsitem = this.datasets.find(o => o.slug == ds.slug);
                this.$set(dsitem, 'editing', true);

                try {

                    let dsobj = this.org.Dataset(ds.slug);
                    let ret = await dsobj.update(newds.name, newds.isPublic);

                    if (ret) {
                        
                        dsitem.slug = ds.slug;
                        dsitem.name = newds.name;
                        dsitem.public = newds.isPublic;

                        // Rename
                        if (newds.slug !== dsitem.slug) {

                            let ren = await dsobj.rename(newds.slug);
                            if (ren) {
                                dsitem.slug = newds.slug;
                            } else {
                                this.error = `Failed to rename dataset \"${ds.slug}\" to \"${newds.slug}\"`;
                                console.error(ren);
                            }
                        }

                    } else {
                        this.error = `Failed to update dataset \"${ds.slug}\"`;
                        console.error(ret);
                    }
                } catch(e) {
                    console.error(e);
                    this.error = "Failed to update dataset: " + e.message;
                }
                this.loading = false;
                this.$set(dsitem, 'editing', false);
            }
        },        

        viewDataset(ds){

            if (ds.editing || ds.deleting) return;

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
