<template>
    <Window id="roleManagementDialog" title="Role Management" modal max-width="60%" fixed-size @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <Message v-model="error" />

            <Tabs :value="activeTab" @update:value="val => activeTab = val">
                <TabList>
                    <Tab value="view"><i class="fa-solid fa-eye me-1" />View Roles</Tab>
                    <Tab value="add"><i class="fa-solid fa-plus me-1" />Add Role</Tab>
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
                                    <i class="fa-solid fa-users" />
                                    <div>
                                        <div class="role-name">{{ role }}</div>
                                        <div class="role-description">
                                            {{ role === 'Admin' ? 'Administrator role with full system access' : 'Custom user role' }}
                                        </div>
                                    </div>
                                </div>
                                <div class="role-actions">
                                    <Button v-if="role !== 'Admin'" severity="danger"
                                            size="small" :disabled="deletingRole === role" icon="fa-solid fa-trash"
                                            :label="deletingRole === role ? 'Deleting...' : 'Delete'"
                                            @click="deleteRole(role)" />
                                    <Tag v-else severity="secondary" value="System Role" />
                                </div>
                            </div>
                        </div>
                    </TabPanel>
                    <TabPanel value="add">
                        <h4>Add New Role</h4>
                        <form class="form" :class="{ error: !!error }" @submit.prevent>
                            <div class="field">
                                <label for="role-management-dialog-role-name">Role Name</label>
                                <InputText id="role-management-dialog-role-name" ref="txtRoleName" v-model="newRoleName" placeholder="Enter role name"
                                           class="w-full" @keydown="clearError()" @keyup.enter="confirmAddRole()" />
                                <small>Role names should be descriptive (e.g., "Editor", "Viewer", "Manager")</small>
                            </div>
                        </form>
                        <div class="add-role-actions">
                            <Button :disabled="addingRole || !newRoleName.trim()" :loading="addingRole"
                                    severity="primary" icon="fa-solid fa-plus" label="Add Role" @click="confirmAddRole()" />
                        </div>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            <div class="dialog-buttons">
                <Button severity="secondary" label="Close" @click="$emit('close')" />
            </div>
        </div>

        <!-- Delete Role Confirmation Dialog -->
        <ConfirmDialog v-if="showDeleteDialog"
                       title="Delete Role"
                       :message="`Are you sure you want to delete the role <strong>${roleToDelete}</strong>?<br/><br/><i class='fa-solid fa-triangle-exclamation'></i> This action cannot be undone. Users with this role will lose associated permissions.`"
                       confirm-text="Delete Role"
                       cancel-text="Cancel"
                       confirm-button-class="danger"
                       @close="handleDeleteDialogClose" />
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/Window.vue';
import Message from '@/components/Message.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import reg from '@/libs/api/sharedRegistry';

export default {
    components: {
        LoadingSpinner,
        Window, Message, ConfirmDialog, Button, PrimeMessage, InputText, Tag,
        Tabs, TabList, Tab, TabPanels, TabPanel
    },
    props: {
        roles: {
            type: Array,
            required: true
        }
    },
    emits: ['close', 'onRolesChanged'],

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
    watch: {
        activeTab: function(newTab) {
            if (newTab === 'add') {
                this.$nextTick(() => this.focusRoleInput());
            }
        }
    },
    mounted: function () {
        this.$nextTick(() => {
            if (this.activeTab === 'add') {
                this.focusRoleInput();
            }
        });
    },
    methods: {
        focusRoleInput() {
            if (this.$refs.txtRoleName) {
                const el = this.$refs.txtRoleName.$el || this.$refs.txtRoleName;
                if (el && el.focus) el.focus();
            }
        },


        clearError: function () {
            this.error = "";
        },

        async confirmAddRole() {
            if (!this.newRoleName.trim()) return;

            this.addingRole = true;
            try {
                await reg.admin.createRole(this.newRoleName.trim());

                this.currentRoles.push(this.newRoleName.trim());
                this.$notify.success(`Role "${this.newRoleName}" created successfully`, { summary: 'Role Created' });
                this.newRoleName = "";
                this.activeTab = 'view';

                this.$emit('onRolesChanged');
            } catch (e) {
                this.$notify.error('Failed to create role: ' + e.message);
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
                await reg.admin.deleteRole(this.roleToDelete);
                // NOTE: DELETE role endpoint returns 204 No Content (empty response)
                // This is normal and indicates success

                this.currentRoles = this.currentRoles.filter(role => role !== this.roleToDelete);
                this.$notify.success(`Role "${this.roleToDelete}" deleted successfully`, { summary: 'Role Deleted' });

                this.$emit('onRolesChanged');

                this.showDeleteDialog = false;
                this.roleToDelete = null;
            } catch (e) {
                this.$notify.error('Failed to delete role: ' + e.message);
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
