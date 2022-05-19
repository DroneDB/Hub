<template>
<div id="users">
    <Message bindTo="error" />

    <div v-if="loading" class="loading">
        <i class="icon circle notch spin" />
    </div>
    <div v-else>
        <div class="top ui equal width grid middle aligned">
            <div class="column">
                <h1>Users</h1>
            </div>
            <div class="column right aligned">
                <button @click.stop="handleNew()" class="ui primary button icon"><i class="ui icon add"></i>&nbsp;New User</button>
            </div>
        </div>
        <div v-for="u in users" class="ui segments users">
            <div class="ui segment" @click="">
                <div class="ui two column grid">
                    <div class="two column row">
                        <div class="thirteen wide column main"><i class="user icon"></i>{{u.username}}</div>
                        <div class="three wide column right aligned">
                            <button @click.stop="handleEdit(u)" class="ui button icon small grey"
                                        :class="{loading: u.editing}"
                                        :disabled="u.editing || u.deleting">
                                        <i class="ui icon pencil"></i>
                            </button>                        
                            <button @click.stop="handleDelete(u)" class="ui button icon small negative" 
                                    :class="{loading: u.deleting}"
                                    :disabled="u.deleting || u.editing"><i class="ui icon trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-if="users.length == 0" class="ui segment">
            <h3>No users found</h3>
            <p>Are you logged in?</p>
        </div>
    </div>
    <!--
    <DeleteDatasetDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :dsSlug="currentDsSlug"></DeleteDatasetDialog>
    <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
    <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbiddenSlugs="forbiddenSlugs" @onClose="handleDatasetClose"></DatasetDialog>
-->
</div>
</template>

<script>
import Message from '../Message.vue';
import ddb from 'ddb';
// import DeleteDatasetDialog from './DeleteDatasetDialog.vue';
// import DatasetDialog from './DatasetDialog.vue';
// import MessageDialog from '../common/MessageDialog.vue'

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message,
        // DeleteDatasetDialog,
        // MessageDialog,
        // DatasetDialog
    },
    data: function () {
        return {
            error: "",
            users: [],
            loading: true,
            
            // deleteDialogOpen: false,
        }
    },
    mounted: async function(){
        try {
            this.users = await reg.users();
        } catch(e) {
            if (e.status === 401){
                this.$router.push({name: "Login"}).catch(()=>{});
            } else {
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    methods: {
        handleDelete(u) {
            // this.deleteDialogOpen = true;
        },

        handleEdit(u) {
            // this.editDataset(ds);
        },

        
        handleNew() {
            // this.dsDialogMode = "new";
            // this.dsDialogOpen = true;
            
        }
    }
}
</script>

<style scoped>
#users {
    margin: 12px;
    margin-top: 36px;
    
    .top{
        margin-bottom: 12px;
    }

    .users {
        .segment {
            &:hover {
                background-color: #f5f5f5;
                cursor: pointer;
            }
        }
        .column{
            font-size: large;
            .main {
                font-weight: bold;
                margin-top: 6px;
                i.icon {
                    margin-right: 20px;
                }
            }
        }
    }
}
</style>
