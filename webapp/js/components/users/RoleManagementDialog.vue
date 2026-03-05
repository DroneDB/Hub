<template>
    <Window title="Role Management" id="roleManagementDialog" @onClose="close" modal maxWidth="60%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />

            <Tabs :value="activeTab" @update:value="val => activeTab = val">
                <TabList>
                    <Tab value="view"><i class="fa-solid fa-eye me-1"></i>View Roles</Tab>
                    <Tab value="add"><i class="fa-solid fa-plus me-1"></i>Add Role</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="view">
                        <h4>Existing Roles</h4>
                        <div v-if="currentRoles.length === 0">
                            <PrimeMessage severity="info" :closable="false">
                                No roles found.
                            </PrimeMessage>
                        </div>
                        <div v-else class="role-list">
                            <div v-for="role in currentRoles" :key="role" class="role-item">
                                <div class="role-info">
                                    <i class="fa-solid fa-users"></i>
                                    <div>
                                        <div class="role-name">{{ role }}</div>
                                        <div class="role-description">
                                            {{ role === 'Admin' ? 'Administrator role with full system access' : 'Custom user role' }}
                                        </div>
                                    </div>
                                </div>
                                <div class="role-actions">
                                    <Button v-if="role !== 'Admin'" @click="deleteRole(role)"
                                            severity="danger" size="small" :disabled="deletingRole === role"
                                            icon="fa-solid fa-trash"
                                            :label="deletingRole === role ? 'Deleting...' : 'Delete'" />
                                    <Tag v-else severity="secondary" value="System Role" />
                                </div>
                            </div>
                        </div>
                    </TabPanel>
                    <TabPanel value="add">
                        <h4>Add New Role</h4>
                        <form v-on:submit.prevent class="form" v-bind:class="{ error: !!error }">
                            <div class="field">
                                <label>Role Name</label>
                                <InputText ref="txtRoleName" @keydown="clearError()" @keyup.enter="confirmAddRole()"
                                       v-model="newRoleName" placeholder="Enter role name" class="w-full" />
                                <small>Role names should be descriptive (e.g., "Editor", "Viewer", "Manager")</small>
                            </div>
                        </form>
                        <div class="add-role-actions">
                            <Button @click="confirmAddRole()" :disabled="addingRole || !newRoleName.trim()"
                                    :loading="addingRole" severity="primary" icon="fa-solid fa-plus" label="Add Role" />
                        </div>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            <div class="dialog-buttons">
                <Button @click="close()" severity="secondary" label="Close" />
            </div>
        </div>

        <!-- Delete Role Confirmation Dialog -->
        <ConfirmDialog v-if="showDeleteDialog"
            title="Delete Role"
            :message="`Are you sure you want to delete the role <strong>${roleToDelete}</strong>?<br/><br/><i class='fa-solid fa-triangle-exclamation'></i> This action cannot be undone. Users with this role will lose associated permissions.`"
            confirmText="Delete Role"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="handleDeleteDialogClose">
        </ConfirmDialog>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message, ConfirmDialog, Button, PrimeMessage, InputText, Tag,
        Tabs, TabList, Tab, TabPanels, TabPanel
    },
    props: {
        roles: {
            type: Array,
            required: true
        }
    },
    emits: ['onClose'],

    data: function () {
        return {
            loading: false,
            error: "",
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
                const el = this.$refs.txtRoleName.$el || this.$refs.txtRoleName;
                if (el && el.focus) el.focus();
            }
        },

        close: function () {
            this.$emit('onClose');
        },

        clearError: function () {
            this.error = "";
        },

        async confirmAddRole() {
            if (!this.newRoleName.trim()) return;

            this.addingRole = true;
            try {
                await reg.createRole(this.newRoleName.trim());

                this.currentRoles.push(this.newRoleName.trim());
                this.$toast.add({ severity: 'success', summary: 'Role Created', detail: `Role "${this.newRoleName}" created successfully`, life: 3000 });
                this.newRoleName = "";
                this.activeTab = 'view';

                this.$emit('onRolesChanged');
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create role: ' + e.message, life: 5000 });
                this.error = e.message;
            }
            this.addingRole = false;
        },

        async deleteRole(roleName) {
            this.roleToDelete = roleName;
            this.showDeleteDialog = true;
        },

        async handleDeleteDialogClose(action) {
            if (action === 'confirm') {
                await this.confirmDeleteRole();
            } else {
                this.showDeleteDialog = false;
                this.roleToDelete = null;
            }
        },

        async confirmDeleteRole() {
            if (!this.roleToDelete) return;

            this.deletingRole = this.roleToDelete;
            try {
                const result = await reg.deleteRole(this.roleToDelete);
                // Note: DELETE role endpoint returns 204 No Content (empty response)
                // This is normal and indicates success

                this.currentRoles = this.currentRoles.filter(role => role !== this.roleToDelete);
                this.$toast.add({ severity: 'success', summary: 'Role Deleted', detail: `Role "${this.roleToDelete}" deleted successfully`, life: 3000 });

                this.$emit('onRolesChanged');

                this.showDeleteDialog = false;
                this.roleToDelete = null;
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete role: ' + e.message, life: 5000 });
                this.error = e.message;
            }
            this.deletingRole = null;
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 25rem;
    padding: 0.25rem;
}

.dialog-buttons {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}

.role-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.role-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border: var(--ddb-border-width) solid var(--ddb-border-light);
    border-radius: var(--ddb-radius-sm);
}

.role-info {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.role-name {
    font-weight: 600;
}

.role-description {
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-muted);
}

.add-role-actions {
    margin-top: 1rem;
}

.w-full {
    width: 100%;
}
</style>
