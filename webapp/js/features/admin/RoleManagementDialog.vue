<template>
    <Window id="roleManagementDialog" title="Role Management" modal max-width="60%" fixed-size @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <!-- The error of a delete: shown here, in the window, once (the confirm question is closed) -->
            <Message v-model="error" severity="error" />

            <Tabs :value="activeTab" @update:value="val => activeTab = val">
                <TabList>
                    <Tab value="view"><i class="fa-solid fa-eye" aria-hidden="true" /><span class="tab-label">View Roles</span></Tab>
                    <Tab value="add"><i class="fa-solid fa-plus" aria-hidden="true" /><span class="tab-label">Add Role</span></Tab>
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
                                            {{ roleDescription(role) }}
                                        </div>
                                    </div>
                                </div>
                                <div class="role-actions">
                                    <Button v-if="!isSystemRole(role)" severity="danger"
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
                        <Form ref="formRef" class="form" :resolver="resolver" :initial-values="{ roleName: '' }" @submit="submit(addRole, $event)">
                            <template #default="$form">
                                <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>
                                <div class="field">
                                    <label for="role-management-dialog-role-name">Role Name</label>
                                    <InputText id="role-management-dialog-role-name" ref="txtRoleName" name="roleName" placeholder="Enter role name"
                                               class="w-100" autocomplete="off" :readonly="busy" :invalid="!!errorOf($form, 'roleName')"
                                               :aria-invalid="errorOf($form, 'roleName') ? 'true' : undefined"
                                               :aria-describedby="errorOf($form, 'roleName') ? 'role-management-dialog-role-name-error role-management-dialog-role-name-help' : 'role-management-dialog-role-name-help'" />
                                    <!-- The rule of the Registry, before any input (FR-ADM-01); user names follow the same one -->
                                    <small id="role-management-dialog-role-name-help">Use {{ nameRule }}</small>
                                    <FieldError id="role-management-dialog-role-name-error" :message="errorOf($form, 'roleName')" />
                                </div>
                                <div class="add-role-actions">
                                    <Button type="submit" :loading="busy" severity="primary" icon="fa-solid fa-plus" label="Add Role" />
                                </div>
                            </template>
                        </Form>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            <div class="dialog-buttons">
                <Button severity="secondary" label="Close" @click="$emit('close')" />
            </div>
        </div>

        <!-- Delete Role Confirmation Dialog -->
        <ConfirmDialog v-if="showDeleteDialog"
                       v-bind="deleteDialog"
                       @close="handleDeleteDialogClose" />
    </Window>
</template>

<script>
import Form from '@primevue/forms/form';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import FieldError from '@/components/FieldError.vue';
import Window from '@/components/HubWindow.vue';
import Message from '@/components/HubMessage.vue';
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
import { isSystemRole, roleDescription } from '@/libs/roles';
import { nameDescription, roleNameProblem } from '@/libs/nameRules';
import { createResolver } from '@/libs/forms/resolver';
import { confirmDialogProps } from '@/libs/deleteConfirmation';
import { useHubForm } from '@/composables/useHubForm';

export default {
    components: {
        LoadingSpinner,
        Window, Message, ConfirmDialog, Button, PrimeMessage, InputText, Tag, Form, FieldError,
        Tabs, TabList, Tab, TabPanels, TabPanel
    },
    props: {
        roles: {
            type: Array,
            required: true
        }
    },
    emits: ['close', 'rolesChanged'],

    setup() {
        // The rule of the Registry (lowercase letters and digits), in its words, as the user types
        const resolver = createResolver({ roleName: roleNameProblem });
        const form = useHubForm({ fields: ['roleName'] });
        return { ...form, resolver, nameRule: nameDescription() };
    },

    data: function () {
        return {
            loading: false,
            error: "",
            activeTab: 'view',
            currentRoles: [...this.roles],
            deletingRole: null,
            showDeleteDialog: false,
            roleToDelete: null
        };
    },
    computed: {
        deleteDialog() {
            return confirmDialogProps({
                kind: 'role',
                items: [this.roleToDelete || ''],
                lost: ['the permissions it gives to the users who have it']
            });
        }
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
        isSystemRole,
        roleDescription,
        focusRoleInput() {
            if (this.$refs.txtRoleName) {
                const el = this.$refs.txtRoleName.$el || this.$refs.txtRoleName;
                if (el && el.focus) el.focus();
            }
        },


        // The request of the Add Role form (the values are checked, and the name is not empty)
        async addRole(values) {
            const name = values.roleName.trim();
            await reg.admin.createRole(name);

            this.currentRoles.push(name);
            this.$notify.success(`Role "${name}" created successfully`, { summary: 'Role Created' });
            this.formRef?.reset?.();
            this.activeTab = 'view';

            this.$emit('rolesChanged');
        },

        async deleteRole(roleName) {
            this.error = "";
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

                this.$emit('rolesChanged');

                this.showDeleteDialog = false;
                this.roleToDelete = null;
            } catch (e) {
                // The question is closed, so the error shows in this window and not behind the question (FR-ADM-01);
                // it is shown once, here, with no toast (FR-ADM-22)
                this.showDeleteDialog = false;
                this.roleToDelete = null;
                // The Registry words a refusal of Identity as "Failed to delete role: ...": the prefix is said once
                const prefix = 'Failed to delete role: ';
                this.error = e.message.startsWith(prefix) ? e.message : prefix + e.message;
            }
            this.deletingRole = null;
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: min(25rem, var(--window-content-width, 100%));
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
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border: var(--ddb-border-width) solid var(--ddb-border-light);
    border-radius: var(--ddb-radius-sm);
}

.role-info {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    flex: 1 1 12rem;
    min-width: 0;
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
</style>
