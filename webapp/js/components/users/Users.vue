<template>
    <div id="users">
        <Toast position="bottom-left" />
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div v-else>
            <div class="top-banner d-flex justify-content-between align-items-center">
                <div>
                    <h1>User Management</h1>
                </div>
                <div>
                    <Button @click.stop="showAddUserDialog = true" severity="primary" icon="fa-solid fa-plus" label="New User" />
                </div>
            </div>

            <!-- User Controls -->
            <div class="">
                <div class="controls-row">
                    <div class="search-col">
                        <IconField>
                            <InputIcon class="fa-solid fa-magnifying-glass" />
                            <InputText v-model="searchQuery" placeholder="Search users" style="width: 100%;" />
                        </IconField>
                    </div>
                    <!-- align right -->
                    <div class="actions-col d-flex gap-2">
                        <Button @click="showRoleManagement = true" severity="secondary" icon="fa-solid fa-gears" label="Manage Roles" />
                        <Button @click="showOrganizationManagement = true" severity="secondary" icon="fa-solid fa-building" label="Manage Organizations" />
                        <Button @click="refreshUsers" severity="secondary" icon="fa-solid fa-arrows-rotate" label="Refresh" />
                    </div>
                </div>
            </div>

            <!-- Users Table -->
            <DataTable :value="filteredUsers" dataKey="userName"
                paginator :rows="10" :rowsPerPageOptions="[5, 10, 25, 50, 100]"
                :alwaysShowPaginator="false"
                paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
                sortField="userName" :sortOrder="1"
                stripedRows rowHover>
                <Column field="userName" :sortable="true">
                    <template #header>
                        <i class="fa-solid fa-user"></i> Username
                    </template>
                    <template #body="slotProps">
                        <strong>{{ slotProps.data.userName }}</strong>
                    </template>
                </Column>
                <Column field="email" header="Email" :sortable="true">
                    <template #body="slotProps">
                        {{ slotProps.data.email || '-' }}
                    </template>
                </Column>
                <Column header="Roles">
                    <template #body="slotProps">
                        <div v-if="slotProps.data.roles && slotProps.data.roles.length > 0">
                            <Chip v-for="role in slotProps.data.roles" :key="role" :label="role" />
                        </div>
                        <span v-else class="text-muted">No roles</span>
                    </template>
                </Column>
                <Column field="organizationCount" header="Organizations" :sortable="true">
                    <template #body="slotProps">
                        <Button @click="showUserOrganizations(slotProps.data)" size="small" title="Manage Organizations" severity="secondary"
                            icon="fa-solid fa-sitemap" :label="String(slotProps.data.organizationCount)" />
                    </template>
                </Column>
                <Column field="datasetCount" header="Datasets" :sortable="true" />
                <Column field="storageUsed" header="Storage" :sortable="true">
                    <template #body="slotProps">
                        <div v-if="slotProps.data.storageQuota">
                            {{ bytesToSize(slotProps.data.storageUsed) }} / {{ bytesToSize(slotProps.data.storageQuota) }}
                            <ProgressBar :value="getStoragePercentage(slotProps.data)" style="height: 1rem;" class="mt-1" />
                        </div>
                        <div v-else>
                            {{ bytesToSize(slotProps.data.storageUsed) }} / Unlimited
                        </div>
                    </template>
                </Column>
                <Column field="createdDate" header="Created" :sortable="true">
                    <template #body="slotProps">
                        {{ formatDate(slotProps.data.createdDate) }}
                    </template>
                </Column>
                <Column header="Actions" :pt="{ bodyCell: { style: 'text-align: center' }, columnHeaderContent: { style: 'display: flex; justify-content: center' } }">
                    <template #body="slotProps">
                        <div class="d-flex gap-1 justify-content-center">
                            <Button @click.stop="editUser(slotProps.data)" severity="info" size="small"
                                :loading="slotProps.data.editing" :disabled="slotProps.data.editing || slotProps.data.deleting"
                                title="Edit User" icon="fa-solid fa-pen-to-square" />
                            <Button @click.stop="changePassword(slotProps.data)" severity="warn" size="small"
                                :disabled="slotProps.data.editing || slotProps.data.deleting" title="Change Password"
                                icon="fa-solid fa-key" />
                            <Button @click.stop="handleDelete(slotProps.data)" severity="danger" size="small"
                                :loading="slotProps.data.deleting"
                                :disabled="slotProps.data.deleting || slotProps.data.editing || slotProps.data.userName === 'admin'"
                                title="Delete User" icon="fa-solid fa-trash" />
                        </div>
                    </template>
                </Column>
                <template #empty>
                    <div class="text-center p-4">
                        <h3>No users found</h3>
                        <p>{{ searchQuery ? 'Try adjusting your search criteria.' : 'No users available.' }}</p>
                    </div>
                </template>
            </DataTable>
        </div>

        <!-- Dialogs -->
        <AddUserDialog v-if="showAddUserDialog" @onClose="handleCloseAddUser" :availableRoles="availableRoles" />
        <EditUserDialog v-if="showEditUserDialog" @onClose="handleCloseEditUser"
                        :user="currentUser" :availableRoles="availableRoles" />
        <ChangePasswordDialog v-if="showChangePasswordDialog" @onClose="handleCloseChangePassword"
                              :user="currentUser" />
        <OrganizationsDialog v-if="showOrganizationsDialog" @onClose="handleCloseOrganizations"
                             :user="currentUser" />
        <RoleManagementDialog v-if="showRoleManagement" @onClose="handleCloseRoleManagement"
                              :roles="availableRoles" @onRolesChanged="refreshRoles" />
        <OrganizationManagementDialog v-if="showOrganizationManagement" @onClose="handleCloseOrganizationManagement" />

        <!-- Delete User Confirmation Dialog -->
        <ConfirmDialog v-if="showDeleteDialog"
            title="Delete User"
            :message="deleteDialogMessage"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="handleDeleteDialogClose">
            <template #extra>
                <div class="delete-options">
                    <div class="field">
                        <label>Transfer data to successor (optional)</label>
                        <Select v-model="deleteSuccessor" :options="successorOptions" optionLabel="label" optionValue="value" placeholder="-- Delete all data --" showClear class="w-full" />
                        <small class="text-muted">If selected, all organizations and datasets will be transferred to this user.</small>
                    </div>

                    <div v-if="deleteSuccessor" class="field">
                        <label>Conflict Resolution Strategy</label>
                        <div class="radio-group">
                            <div class="radio-item">
                                <input type="radio" v-model="deleteConflictResolution" value="Rename" id="conflict-rename">
                                <label for="conflict-rename">Rename conflicting datasets</label>
                            </div>
                            <div class="radio-item">
                                <input type="radio" v-model="deleteConflictResolution" value="Overwrite" id="conflict-overwrite">
                                <label for="conflict-overwrite">Overwrite existing datasets</label>
                            </div>
                            <div class="radio-item">
                                <input type="radio" v-model="deleteConflictResolution" value="HaltOnConflict" id="conflict-halt">
                                <label for="conflict-halt">Stop if conflict detected</label>
                            </div>
                        </div>
                    </div>

                    <PrimeMessage v-if="!deleteSuccessor" severity="warn" :closable="false">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong>Warning:</strong> All user data (organizations, datasets, files) will be permanently deleted.
                    </PrimeMessage>
                    <PrimeMessage v-else severity="info" :closable="false">
                        <i class="fa-solid fa-circle-info"></i>
                        Organizations and datasets will be transferred to <strong>{{ deleteSuccessor }}</strong>.
                    </PrimeMessage>
                </div>
            </template>
        </ConfirmDialog>

        <!-- Delete Result Dialog -->
        <Window v-if="showDeleteResultDialog" title="User Deleted Successfully" id="deleteResultDialog" @onClose="closeDeleteResultDialog" modal maxWidth="50%" fixedSize>
            <p>User <strong>{{ deleteResult && deleteResult.userName }}</strong> has been deleted.</p>

            <div v-if="deleteResult" class="delete-result-details">
                <div v-if="deleteResult.successor" class="result-item">
                    <i class="fa-solid fa-user"></i>
                    Data transferred to: <strong>{{ deleteResult.successor }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-building"></i>
                    Organizations transferred: <strong>{{ deleteResult.organizationsTransferred || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-trash"></i>
                    Organizations deleted: <strong>{{ deleteResult.organizationsDeleted || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-database"></i>
                    Datasets transferred: <strong>{{ deleteResult.datasetsTransferred || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-trash"></i>
                    Datasets deleted: <strong>{{ deleteResult.datasetsDeleted || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-clock"></i>
                    Batches deleted: <strong>{{ deleteResult.batchesDeleted || 0 }}</strong>
                </div>
            </div>

            <div class="buttons mt-3 text-end">
                <Button @click="closeDeleteResultDialog" severity="info" icon="fa-solid fa-check" label="OK" />
            </div>
        </Window>
    </div>
</template>

<script>
import Message from '../Message.vue';
import Window from '../Window.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import AddUserDialog from './AddUserDialog.vue';
import EditUserDialog from './EditUserDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';
import OrganizationsDialog from './OrganizationsDialog.vue';
import RoleManagementDialog from './RoleManagementDialog.vue';
import OrganizationManagementDialog from './OrganizationManagementDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Toast from 'primevue/toast';
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Select from 'primevue/select';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressBar from 'primevue/progressbar';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import reg from '../../libs/sharedRegistry';
import { bytesToSize } from '../../libs/utils';

export default {
    components: {
        Message,
        Window,
        ConfirmDialog,
        AddUserDialog,
        EditUserDialog,
        ChangePasswordDialog,
        OrganizationsDialog,
        RoleManagementDialog,
        OrganizationManagementDialog,
        Button,
        PrimeMessage,
        Toast,
        Tag,
        Chip,
        Select,
        DataTable,
        Column,
        ProgressBar,
        InputText,
        InputIcon,
        IconField
    },
    data: function () {
        return {
            error: "",
            users: [],
            availableRoles: [],
            loading: true,
            showAddUserDialog: false,
            showEditUserDialog: false,
            showChangePasswordDialog: false,
            showOrganizationsDialog: false,
            showRoleManagement: false,
            showOrganizationManagement: false,
            showDeleteDialog: false,
            showDeleteResultDialog: false,
            userToDelete: null,
            currentUser: null,

            // Delete options
            deleteSuccessor: null,
            deleteConflictResolution: 'Rename',
            deleteResult: null,

            // Filtering
            searchQuery: ""
        }
    },
    mounted: async function () {
        await this.loadData();
    },
    computed: {
        // Filtering
        filteredUsers: function () {
            if (!this.searchQuery) return this.users;

            const query = this.searchQuery.toLowerCase();
            return this.users.filter(user => {
                const userName = (user.userName || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                return userName.includes(query) || email.includes(query);
            });
        },
        successorOptions() {
            if (!this.userToDelete) return [];
            return this.users
                .filter(u => u.userName !== this.userToDelete.userName)
                .map(u => ({ label: u.userName, value: u.userName }));
        },
        deleteDialogMessage() {
            if (!this.userToDelete) return '';
            return `Are you sure you want to delete user <strong>${this.userToDelete.userName}</strong>?`;
        }
    },

    methods: {
        bytesToSize,

        async loadData() {
            try {
                this.loading = true;
                const [usersData, rolesData] = await Promise.all([
                    reg.usersDetailed(),
                    reg.userRoles()
                ]);

                this.users = usersData.map(user => ({
                    ...user,
                    editing: false,
                    deleting: false
                }));
                this.availableRoles = rolesData;
            } catch (e) {
                if (e.status === 401) {
                    this.$router.push({ name: "Login" }).catch(() => { });
                } else {
                    this.error = e.message;
                }
            }
            this.loading = false;
        },

        async refreshRoles() {
            try {
                this.availableRoles = await reg.userRoles();
            } catch (e) {
                this.error = e.message;
            }
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },

        getStoragePercentage(user) {
            if (!user.storageQuota) return 0;
            return Math.round((user.storageUsed / user.storageQuota) * 100);
        },

        editUser(user) {
            this.currentUser = { ...user };
            this.showEditUserDialog = true;
        },

        changePassword(user) {
            this.currentUser = user;
            this.showChangePasswordDialog = true;
        },

        showUserOrganizations(user) {
            this.currentUser = user;
            this.showOrganizationsDialog = true;
        },

        async handleDelete(user) {
            this.userToDelete = user;
            this.deleteSuccessor = null;
            this.deleteConflictResolution = 'Rename';
            this.deleteResult = null;
            this.showDeleteDialog = true;
        },

        async handleDeleteDialogClose(action) {
            if (action === 'confirm') {
                await this.confirmDelete();
            } else {
                this.showDeleteDialog = false;
            }
        },

        async confirmDelete() {
            if (!this.userToDelete) return;

            try {
                this.userToDelete.deleting = true;

                // Perform the delete operation with optional successor
                const result = await reg.deleteUser(
                    this.userToDelete.userName,
                    this.deleteSuccessor,
                    this.deleteConflictResolution
                );

                // Store result for display
                this.deleteResult = result;

                // Remove user from list
                this.users = this.users.filter(u => u.userName !== this.userToDelete.userName);

                // Close delete dialog and show result dialog
                this.showDeleteDialog = false;
                this.showDeleteResultDialog = true;

                this.$toast.add({ severity: 'success', summary: 'User Deleted', detail: `User "${result.userName}" deleted successfully`, life: 3000 });

            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete user: ' + e.message, life: 5000 });
                this.error = e.message;
                if (this.userToDelete) {
                    this.userToDelete.deleting = false;
                }
                // Don't close dialog on error so user can see the error message
            }
        },

        closeDeleteResultDialog() {
            this.showDeleteResultDialog = false;
            this.deleteResult = null;
            this.userToDelete = null;
            // Reload to refresh data if successor was used
            if (this.deleteSuccessor) {
                this.loadData();
            }
        },

        handleCloseAddUser: function (user) {
            this.showAddUserDialog = false;
            if (user) {
                this.loadData(); // Reload to get complete user data
            }
        },

        handleCloseEditUser: function (result) {
            this.showEditUserDialog = false;
            if (result === 'updated') {
                this.loadData(); // Reload to get updated user data
            }
            this.currentUser = null;
        },

        handleCloseChangePassword: function (result) {
            this.showChangePasswordDialog = false;
            this.currentUser = null;
        },

        handleCloseOrganizations: function (result) {
            this.showOrganizationsDialog = false;
            if (result === 'updated') {
                this.loadData(); // Reload to get updated organization counts
            }
            this.currentUser = null;
        },

        handleCloseRoleManagement: function (result) {
            this.showRoleManagement = false;
            if (result === 'updated') {
                this.refreshRoles();
            }
        },

        handleCloseOrganizationManagement: function (result) {
            this.showOrganizationManagement = false;
            if (result === 'updated') {
                // Organizations changed, reload user data to update counts
                this.loadData();
            }
        },

        refreshUsers: async function () {
            await this.loadData();
        }
    }
}
</script>

<style scoped>
#users {
    margin: var(--ddb-spacing-md);
    margin-top: 2.25rem;
}

.top-banner {
    margin-bottom: 0.75rem;
}

.controls-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
}



.delete-options .field {
    margin-bottom: 0.75rem;
}

.radio-group {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    margin-top: var(--ddb-spacing-xs);
}

.radio-item {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.delete-result-details .detail-section {
    margin-bottom: 0.75rem;
}

.delete-result-details .detail-section ul {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
}
</style>
