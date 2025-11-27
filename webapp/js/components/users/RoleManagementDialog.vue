<template>
    <Window title="Role Management" id="roleManagementDialog" @onClose="close" modal maxWidth="60%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>{{ successMessage }}</strong></p>
            </div>

            <div class="ui top attached tabular menu">
                <a class="item" :class="{ active: activeTab === 'view' }" @click="activeTab = 'view'">
                    <i class="eye icon"></i>View Roles
                </a>
                <a class="item" :class="{ active: activeTab === 'add' }" @click="activeTab = 'add'">
                    <i class="plus icon"></i>Add Role
                </a>
            </div>

            <div class="ui bottom attached tab segment" :class="{ active: activeTab === 'view' }">
                <h4>Existing Roles</h4>
                <div v-if="currentRoles.length === 0" class="ui message">
                    <p>No roles found.</p>
                </div>
                <div v-else class="ui divided list">
                    <div v-for="role in currentRoles" :key="role" class="item">
                        <div class="right floated content">
                            <button v-if="role !== 'Admin'" @click="deleteRole(role)"
                                    class="ui red mini button" :disabled="deletingRole === role">
                                <i class="trash icon"></i>
                                {{ deletingRole === role ? 'Deleting...' : 'Delete' }}
                            </button>
                            <span v-else class="ui grey mini label">System Role</span>
                        </div>
                        <i class="users large icon"></i>
                        <div class="content">
                            <div class="header">{{ role }}</div>
                            <div class="description">
                                {{ role === 'Admin' ? 'Administrator role with full system access' : 'Custom user role' }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ui bottom attached tab segment" :class="{ active: activeTab === 'add' }">
                <h4>Add New Role</h4>
                <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                    <div class="field">
                        <label>Role Name</label>
                        <input ref="txtRoleName" v-on:keydown="clearError()" v-on:keyup.enter="confirmAddRole()"
                               type="text" v-model="newRoleName" placeholder="Enter role name" />
                        <small>Role names should be descriptive (e.g., "Editor", "Viewer", "Manager")</small>
                    </div>
                </form>
                <div class="ui buttons">
                    <button @click="confirmAddRole()" :disabled="addingRole || !newRoleName.trim()"
                            :class="{ loading: addingRole }" class="ui primary button">
                        <i class="plus icon"></i>Add Role
                    </button>
                </div>
            </div>

            <div class="dialog-buttons">
                <button @click="close()" class="ui button">
                    Close
                </button>
            </div>
        </div>

        <!-- Delete Role Confirmation Dialog -->
        <div v-if="showDeleteDialog" class="ui dimmer modals page transition visible active">
            <div class="ui small modal transition visible active">
                <i class="close icon" @click="showDeleteDialog = false"></i>
                <div class="header">
                    <i class="trash icon"></i>
                    Delete Role
                </div>
                <div class="content">
                    <p>Are you sure you want to delete the role <strong>{{ roleToDelete }}</strong>?</p>
                    <p class="ui warning message">
                        <i class="warning icon"></i>
                        This action cannot be undone. Users with this role will lose associated permissions.
                    </p>
                </div>
                <div class="actions">
                    <button class="ui button" @click="showDeleteDialog = false">
                        Cancel
                    </button>
                    <button class="ui red button" @click="confirmDeleteRole" :class="{ loading: deletingRole === roleToDelete }">
                        <i class="trash icon"></i>
                        Delete Role
                    </button>
                </div>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import extendedRegistry from '../../libs/userManagementRegistry';

export default {
    components: {
        Window, Message
    },
    props: {
        roles: {
            type: Array,
            required: true
        }
    },

    data: function () {
        return {
            loading: false,
            error: "",
            success: false,
            successMessage: "",
            activeTab: 'view',
            currentRoles: [...this.roles],
            newRoleName: "",
            addingRole: false,
            deletingRole: null,
            showDeleteDialog: false,
            roleToDelete: null
        };
    },
    mounted: function () {
        this.$nextTick(() => {
            if (this.activeTab === 'add') {
                this.focusRoleInput();
            }
        });
    },
    watch: {
        activeTab: function(newTab) {
            if (newTab === 'add') {
                this.$nextTick(() => this.focusRoleInput());
            }
        }
    },
    methods: {
        focusRoleInput() {
            if (this.$refs.txtRoleName) {
                this.$refs.txtRoleName.focus();
            }
        },

        close: function () {
            this.$emit('onClose');
        },

        clearError: function () {
            this.error = "";
            this.success = false;
        },

        async confirmAddRole() {
            if (!this.newRoleName.trim()) return;

            this.addingRole = true;
            try {
                await extendedRegistry.createRole(this.newRoleName.trim());

                this.currentRoles.push(this.newRoleName.trim());
                this.success = true;
                this.successMessage = `Role "${this.newRoleName}" created successfully!`;
                this.newRoleName = "";
                this.activeTab = 'view';

                this.$emit('onRolesChanged');

                setTimeout(() => {
                    this.success = false;
                }, 3000);
            } catch (e) {
                this.error = e.message;
            }
            this.addingRole = false;
        },

        async deleteRole(roleName) {
            this.roleToDelete = roleName;
            this.showDeleteDialog = true;
        },

        async confirmDeleteRole() {
            if (!this.roleToDelete) return;

            this.deletingRole = this.roleToDelete;
            try {
                const result = await extendedRegistry.deleteRole(this.roleToDelete);
                // Note: DELETE role endpoint returns 204 No Content (empty response)
                // This is normal and indicates success

                this.currentRoles = this.currentRoles.filter(role => role !== this.roleToDelete);
                this.success = true;
                this.successMessage = `Role "${this.roleToDelete}" deleted successfully!`;

                this.$emit('onRolesChanged');

                this.showDeleteDialog = false;
                this.roleToDelete = null;

                setTimeout(() => {
                    this.success = false;
                }, 3000);
            } catch (e) {
                this.error = e.message;
            }
            this.deletingRole = null;
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 400px;
    padding: 4px;
}

.dialog-buttons {
    margin-top: 16px;
    text-align: right;
    border-top: 1px solid #d4d4d5;
    padding-top: 1rem;
}

.ui.tab.segment {
    border-radius: 0;
    border-top: none;
}

.ui.tab.segment.active {
    display: block;
}

.ui.tab.segment:not(.active) {
    display: none;
}

.ui.tabular.menu .item {
    cursor: pointer;
}

.form {
    margin-bottom: 20px;
}

.ui.buttons {
    margin-top: 1rem;
}
</style>
