<template>
<div id="organizations">
    <Message bindTo="error" />

    <div class="top-banner ui equal width grid middle aligned">
        <div class="column">
            <h1>Organizations</h1>
            <p>Organizations are groups of users that share datasets.</p>
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
            <div class="ui segment">
                <div class="ui grid middle aligned">
                    <div class="four wide column left aligned main-col"><a href="javascript:void(0)" @click.stop="viewOrganization(org)"><i class="large users icon"></i>{{org.slug}}</a></div>
                    <div class="five wide column left aligned">{{org.name}}</div>
                    <div class="four wide column left aligned">{{org.owner}}</div>
                    <div class="two wide column left aligned">
                        <div v-if="org.isPublic"><i class="large globe icon"></i>Public</div>
                        <div v-else><i class="large lock icon"></i>Private</div>
                    </div>
                    <div class="one wide column right aligned">
                        <button @click="handleRename(org)" class="ui button icon small grey"
                                    :class="{loading: org.renaming}"
                                    :disabled="org.renaming">
                                    <i class="ui icon edit outline"></i>
                        </button>
                        <button @click.stop="handleDelete(org)" class="ui button icon small negative" 
                                :class="{loading: org.deleting}"
                                :disabled="org.deleting"><i class="ui icon trash"></i>
                        </button>
                    </div>
                </div>
                <!--<div class="ui middle aligned divided list">
                    <div class="item">
                        <div><i class="large users icon"></i></div>
                        <div><i class="large users icon"></i></div>
                        <div><i class="large users icon"></i></div>
                        <div><i class="large users icon"></i></div>
                        <div><i class="large users icon"></i></div>
                        <div class="right floated">
                            <button @click="handleRename(org)" class="ui button icon small grey"
                                    :class="{loading: org.renaming}"
                                    :disabled="org.renaming">
                                    <i class="ui icon edit outline"></i>
                            </button>
                            <button @click.stop="handleDelete(org)" class="ui button icon small negative" 
                                :class="{loading: org.deleting}"
                                :disabled="org.deleting"><i class="ui icon trash"></i></button>
                        </div>
                        
                        <a href="javascript:void(0)" @click.stop="viewOrganization(org)"><i class="large factory icon"></i> {{org.name}}</a>
                        
                    </div>
                </div>-->
            </div>
        </div>
    </div>
</div>
</template>

<script>
import Message from './Message.vue';
import ddb from 'ddb';
import { setTitle } from '../libs/utils';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message
    },
    data: function () {
        return {
            error: "",
            organizations: [],
            loading: true
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
                    renaming: false,
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

        async handleDelete(ds){
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

        async handleRename(ds){
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
        a {
            font-weight: bold;
            color: black;
            &:hover {
                color: #2185d0;
            }
        }
        .column {
            font-size: large;
        }
        i.icon {
                margin-right: 5px;
        }
        .main-col {
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


}
</style>
