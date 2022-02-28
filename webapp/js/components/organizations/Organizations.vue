<template>
<div id="organizations">
    <Message bindTo="error" />

    <div class="top-banner ui equal width grid middle aligned">
        <div class="column">
            <h1>Organizations</h1>
            <p>Organizations are groups of datasets managed by a single owner.</p>
        </div>
        <div class="column right aligned">
            <button @click.stop="handleNew()" class="ui primary button icon"><i class="ui icon add"></i>&nbsp;Create Organization</button>
        </div>
    </div>
    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
        <div v-for="org in organizations" class="ui segments organization">            
            <div class="ui segment" @click="viewOrganization(org)">
                <div class="ui grid middle aligned flex-container">
                    <div class="flex-item column left aligned main-col"><i class="large users icon"></i>{{org.slug}}</div>
                    <div class="flex-item column left aligned">{{org.name ? org.name : '—'}}</div>
                    <div class="flex-item column left aligned">{{org.owner ? org.owner : '—'}}</div>
                    <div class="flex-item column left aligned">
                        <div v-if="org.isPublic"><i class="large globe icon"></i>Public</div>
                        <div v-else><i class="large lock icon"></i>Private</div>
                    </div>
                    <div class="flex-item column actions right aligned">
                        <button v-if="org.slug !== 'public' && org.slug !== org.owner" @click.stop="handleEdit(org)" class="ui button icon small grey"
                                    :class="{loading: org.editing}"
                                    :disabled="org.editing">
                                    <i class="ui icon pencil"></i>
                        </button>
                        <button v-if="org.slug !== 'public' && org.slug !== org.owner" @click.stop="handleDelete(org)" class="ui button icon small negative" 
                                :class="{loading: org.deleting}"                                
                                :disabled="org.deleting"><i class="ui icon trash"></i>
                        </button>
                        <button v-else-if="org.slug == 'public'" @click.stop="showMessage('This is the public organization. It cannot be deleted or edited.')" class="ui button icon small info"
                                :disabled="org.deleting"><i class="ui icon info"></i>
                        </button>
                        <button v-else-if="org.slug == org.owner" @click.stop="showMessage('This is the user organization. It cannot be deleted or edited.')" class="ui button icon small info"
                                :disabled="org.deleting"><i class="ui icon info"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <DeleteOrganizationDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :orgSlug="currentOrgSlug"></DeleteOrganizationDialog>
    <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
    <OrganizationDialog v-if="orgDialogOpen" :mode="orgDialogMode" :model="orgDialogModel" @onClose="handleOrganizationClose"></OrganizationDialog>

</div>
</template>

<script>
import Message from '../Message.vue';
import DeleteOrganizationDialog from './DeleteOrganizationDialog.vue';
import OrganizationDialog from './OrganizationDialog.vue';
import MessageDialog from '../common/MessageDialog.vue'
import ddb from 'ddb';
import { setTitle } from '../../libs/utils';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message,
        DeleteOrganizationDialog,
        MessageDialog,
        OrganizationDialog
    },
    
    data: function () {
        return {
            error: "",
            organizations: [],
            loading: true,
            deleteDialogOpen: false,
            currentOrgSlug: null,
            messageDialogOpen: false,
            currentMessage: null,
            userName: reg.getUsername(),

            orgDialogModel: null,
            orgDialogMode: null,
            orgDialogOpen: false,
        }
    },
    mounted: async function(){
        setTitle("Organizations");
        
        try {
            let tmp = await reg.getOrganizations()
            
            this.organizations = tmp.map(item => {
                let org = item.org;
                return {
                    slug: org.slug,
                    name: org.name,
                    editing: false,
                    deleting: false,
                    description: org.description,
                    creationDate: Date.parse(org.creationDate),
                    owner: org.owner,
                    isPublic: org.isPublic
                };
            });

            if (this.organizations.length === 0) {
                this.$router.push({name: "Upload"}).catch(()=>{});
            }
        } catch(e) {

            if (e.message === "Unauthorized")
                this.$router.push({name: "Login"}).catch(()=>{});
            else
                this.error = e.message;
            
        }
        this.loading = false;
    },
    methods: {       

        handleDelete(org) {

            this.currentOrgSlug = org.slug;
            this.deleteDialogOpen = true;

            /*
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
            }*/
        },

        async handleDeleteClose(res) {
            this.deleteDialogOpen = false;

            if (res == "close") {
                this.currentOrgSlug = null;
                return;
            }

            let org = this.organizations.find(o => o.slug == this.currentOrgSlug);
            org.deleting = true;

            try {
                
                let ret = await reg.deleteOrganization(this.currentOrgSlug);

                if (ret) {
                    this.organizations = this.organizations.filter(o => o.slug !== this.currentOrgSlug);
                } else {
                    this.error = "Failed to delete organization \"" + this.currentOrgSlug + "\"";
                    console.error(ret);
                    org.deleting = false;
                }
            } catch(e) {
                console.error(e);
                this.error = "Failed to delete organization: " + e.message;
                org.deleting = false;
            }

        },

        editOrganization(org) {
            this.orgDialogModel = {
                slug: org.slug,
                name: org.name,
                description: org.description,
                isPublic: org.isPublic
            };
            this.orgDialogMode = "edit";
            this.orgDialogOpen = true;
        },
        
        newOrganization() {
            this.orgDialogMode = "new";
            this.orgDialogOpen = true;
        },

        handleNew() {
            this.newOrganization();
        },

        async handleOrganizationClose(res, neworg) {
            this.orgDialogOpen = false;

            if (res == "close") {
                this.orgDialogModel = null;
                return;
            }

            if (this.orgDialogMode == "new") {
                this.orgDialogModel = null;
                this.orgDialogOpen = false;
                this.loading = true;

                try {
                    let ret = await reg.createOrganization(neworg.slug, neworg.name, neworg.description, neworg.isPublic);
                    if (ret) {
                        this.organizations.push({
                            slug: neworg.slug,
                            name: neworg.name,
                            description: neworg.description,
                            isPublic: neworg.isPublic
                        });
                    } else {
                        this.error = "Failed to create organization \"" + neworg.slug + "\"";
                        console.error(ret);
                    }
                } catch(e) {
                    console.error(e);
                    this.error = "Failed to create organization: " + e.message;
                }
                this.loading = false;

            } else if (this.orgDialogMode == "edit") {
                let org = this.orgDialogModel;
                this.orgDialogModel = null;
                this.orgDialogOpen = false;
                this.loading = true;

                try {
                    let ret = await reg.updateOrganization(org.slug, neworg.name, neworg.description, neworg.isPublic);
                    if (ret) {
                        let orgitem = this.organizations.find(o => o.slug == org.slug);
                        orgitem.slug = org.slug;
                        orgitem.name = neworg.name;
                        orgitem.description = neworg.description;
                        orgitem.isPublic = neworg.isPublic;
                    } else {
                        this.error = "Failed to update organization \"" + org.slug + "\"";
                        console.error(ret);
                    }
                } catch(e) {
                    console.error(e);
                    this.error = "Failed to update organization: " + e.message;
                }
                this.loading = false;
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

        handleEdit(org){

            this.editOrganization(org);
            // TODO: add proper modal
            /*var newName;

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
            }*/
        },

        viewOrganization(org){
            this.$router.push({name: "UserHome", params: {
                org: org.slug
            }});
        },

        upload: function(){
            this.$router.push({name: "Upload"});
        }
    }
}
</script>

<style scoped>
#organizations {
    .top-banner {
        margin-top: 30px;
        margin-bottom: 40px;
    }
    margin: 12px;
    margin-top: 16px;
    padding-bottom: 16px;
    .organization {

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
