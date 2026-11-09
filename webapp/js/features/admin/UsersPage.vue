<template>
    <div id="users" class="page-scroll">
        <Message v-model="error" />

        <LoadingSpinner v-if="loading" />
        <div v-else>
            <div class="top-banner d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                    <h1>User Management</h1>
                </div>
                <div>
                    <Button severity="primary" icon="fa-solid fa-plus" label="New User" @click.stop="showAddUserDialog = true" />
                </div>
            </div>

            <!-- User Controls -->
            <div class="">
                <div class="controls-row">
                    <div class="search-col flex-grow-1">
                        <SearchField ref="searchField" v-model="searchQuery" label="Search users" />
                    </div>
                    <!-- align right -->
                    <div class="actions-col d-flex flex-wrap gap-2">
                        <Button severity="secondary" icon="fa-solid fa-gears" label="Manage Roles" @click="showRoleManagement = true" />
                        <Button severity="secondary" icon="fa-solid fa-building" label="Manage Organizations" @click="showOrganizationManagement = true" />
                        <Button severity="secondary" icon="fa-solid fa-arrows-rotate" label="Refresh" @click="refreshUsers" />
                    </div>
                </div>
            </div>

            <!-- Users Table -->
            <DataTable :value="filteredUsers" data-key="userName" :class="STACKED_TABLE_CLASS"
                       paginator :rows="10" :rows-per-page-options="[5, 10, 25, 50, 100]" :page-link-size="3"
                       :always-show-paginator="false"
                       paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
                       sort-field="userName" :sort-order="1"
                       striped-rows row-hover>
                <Column field="userName" :sortable="true" v-bind="stackedColumn(undefined, undefined, {}, sortableHeaderPt(stacked))">
                    <template #header>
                        <i class="fa-solid fa-user" /> Username
                    </template>
                    <template #body="slotProps">
                        <!-- The status is in this column, which every width shows -->
                        <span class="user-name">
                            <strong>{{ slotProps.data.userName }}</strong>
                            <Tag v-if="isDisabledUser(slotProps.data)" severity="danger" value="Disabled" class="disabled-tag" />
                        </span>
                    </template>
                </Column>
                <Column field="email" header="Email" :sortable="true" v-bind="stackedColumn('Email', undefined, {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        {{ slotProps.data.email || '-' }}
                    </template>
                </Column>
                <Column header="Roles" v-bind="stackedColumn('Roles')">
                    <template #body="slotProps">
                        <!-- 'deactivated' is the Disabled tag, not a role to list -->
                        <div v-if="pickableRoles(slotProps.data.roles).length > 0">
                            <Chip v-for="role in pickableRoles(slotProps.data.roles)" :key="role" :label="role" />
                        </div>
                        <span v-else class="text-muted">No roles</span>
                    </template>
                </Column>
                <Column field="organizationCount" header="Organizations" :sortable="true" v-bind="stackedColumn('Organizations', 'md', {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        <Button size="small" title="Manage Organizations" severity="secondary" icon="fa-solid fa-sitemap"
                                :label="String(slotProps.data.organizationCount)" @click="showUserOrganizations(slotProps.data)" />
                    </template>
                </Column>
                <Column field="datasetCount" header="Datasets" :sortable="true" v-bind="stackedColumn('Datasets', 'lg', {}, sortableHeaderPt(stacked))" />
                <Column field="storageUsed" header="Storage" :sortable="true" v-bind="stackedColumn('Storage', undefined, {}, sortableHeaderPt(stacked))">
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
                <Column field="createdDate" header="Created" :sortable="true" v-bind="stackedColumn('Created', 'xl', {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        {{ formatCreated(slotProps.data.createdDate) }}
                    </template>
                </Column>
                <Column header="Actions" v-bind="stackedColumn(undefined, undefined, { style: 'text-align: center' }, { columnHeaderContent: { style: 'display: flex; justify-content: center' } })">
                    <template #body="slotProps">
                        <div class="d-flex gap-1 justify-content-center">
                            <Button size="small" :loading="slotProps.data.editing"
                                    :disabled="slotProps.data.editing || slotProps.data.deleting" title="Edit User" aria-label="Edit User"
                                    icon="fa-solid fa-pen-to-square" @click.stop="editUser(slotProps.data)" />
                            <Button severity="secondary" size="small" :disabled="slotProps.data.editing || slotProps.data.deleting"
                                    title="Change Password" aria-label="Change Password" icon="fa-solid fa-key"
                                    @click.stop="changePassword(slotProps.data)" />
                            <template v-if="canDisableUsers">
                                <Button v-if="isDisabledUser(slotProps.data)" severity="secondary" size="small"
                                        :loading="slotProps.data.switching" :disabled="slotProps.data.switching || slotProps.data.editing || slotProps.data.deleting"
                                        title="Enable User" aria-label="Enable User" icon="fa-solid fa-user-check"
                                        @click.stop="enableUser(slotProps.data)" />
                                <Button v-else severity="warn" size="small"
                                        :loading="slotProps.data.switching" :disabled="slotProps.data.switching || slotProps.data.editing || slotProps.data.deleting"
                                        title="Disable User" aria-label="Disable User" icon="fa-solid fa-user-slash"
                                        @click.stop="disableUser(slotProps.data)" />
                            </template>
                            <Button severity="danger" size="small" :loading="slotProps.data.deleting"
                                    :disabled="slotProps.data.deleting || slotProps.data.editing || slotProps.data.userName === 'admin'"
                                    title="Delete User" aria-label="Delete User"
                                    icon="fa-solid fa-trash" @click.stop="handleDelete(slotProps.data)" />
                        </div>
                    </template>
                </Column>
                <template #empty>
                    <EmptyState title="No users found" items="users" :query="searchQuery" @clear="searchQuery = ''; $refs.searchField?.focus()">
                        <p>No users available.</p>
                    </EmptyState>
                </template>
            </DataTable>
        </div>

        <!-- Dialogs -->
        <AddUserDialog v-if="showAddUserDialog" :available-roles="availableRoles" @close="handleCloseAddUser" />
        <EditUserDialog v-if="showEditUserDialog" :user="currentUser"
                        :available-roles="availableRoles" @close="handleCloseEditUser" />
        <ChangePasswordDialog v-if="showChangePasswordDialog" :user="currentUser"
                              @close="handleCloseChangePassword" />
        <OrganizationsDialog v-if="showOrganizationsDialog" :user="currentUser"
                             @close="handleCloseOrganizations" />
        <RoleManagementDialog v-if="showRoleManagement" :roles="availableRoles"
                              @close="handleCloseRoleManagement" @roles-changed="refreshRoles" />
        <OrganizationManagementDialog v-if="showOrganizationManagement" @close="handleCloseOrganizationManagement" />
        <!-- The Disable question -->
        <DialogHost :dialogs="dialogs" />

        <!-- Delete User Confirmation Dialog -->
        <!-- Deleting all the data asks for the user name to be typed; a transfer does not -->
        <ConfirmDialog v-if="showDeleteDialog"
                       v-bind="deleteDialog"
                       :require-text="deleteSuccessor ? '' : (userToDelete?.userName || '')"
                       @close="handleDeleteDialogClose">
            <template #extra>
                <div class="delete-options">
                    <div class="field">
                        <label id="users-transfer-data-to-successor-label" for="users-transfer-data-to-successor" class="d-block mb-1 fw-semibold">Transfer data to successor (optional)</label>
                        <Select v-model="deleteSuccessor" input-id="users-transfer-data-to-successor" aria-labelledby="users-transfer-data-to-successor-label" :options="successorOptions" option-label="label" option-value="value" placeholder="-- Delete all data --" show-clear class="w-100" />
                        <small class="d-block mt-1 text-muted">If selected, all organizations and datasets will be transferred to this user.</small>
                    </div>

                    <div v-if="deleteSuccessor" class="field">
                        <span id="users-conflict-label" class="d-block fw-semibold">Conflict Resolution Strategy</span>
                        <div class="radio-group" role="radiogroup" aria-labelledby="users-conflict-label">
                            <div class="radio-item">
                                <input id="conflict-rename" v-model="deleteConflictResolution" type="radio" value="Rename">
                                <label for="conflict-rename">Rename conflicting datasets</label>
                            </div>
                            <div class="radio-item">
                                <input id="conflict-overwrite" v-model="deleteConflictResolution" type="radio" value="Overwrite">
                                <label for="conflict-overwrite">Overwrite existing datasets</label>
                            </div>
                            <div class="radio-item">
                                <input id="conflict-halt" v-model="deleteConflictResolution" type="radio" value="HaltOnConflict">
                                <label for="conflict-halt">Stop if conflict detected</label>
                            </div>
                        </div>
                    </div>

                    <PrimeMessage v-if="!deleteSuccessor" severity="warn" :closable="false">
                        <i class="fa-solid fa-triangle-exclamation" />
                        <strong>Warning:</strong> All user data (organizations, datasets, files) will be permanently deleted.
                    </PrimeMessage>
                    <PrimeMessage v-else severity="info" :closable="false">
                        <i class="fa-solid fa-circle-info" />
                        Organizations and datasets will be transferred to <strong>{{ deleteSuccessor }}</strong>.
                    </PrimeMessage>
                </div>
            </template>
        </ConfirmDialog>

        <!-- Delete Result Dialog -->
        <Window v-if="showDeleteResultDialog" id="deleteResultDialog" title="User Deleted Successfully" modal max-width="50%" fixed-size @close="closeDeleteResultDialog">
            <p>User <strong>{{ deleteResult && deleteResult.userName }}</strong> has been deleted.</p>

            <div v-if="deleteResult" class="delete-result-details">
                <div v-if="deleteResult.successor" class="result-item">
                    <i class="fa-solid fa-user" />
                    Data transferred to: <strong>{{ deleteResult.successor }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-building" />
                    Organizations transferred: <strong>{{ deleteResult.organizationsTransferred || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-trash" />
                    Organizations deleted: <strong>{{ deleteResult.organizationsDeleted || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-database" />
                    Datasets transferred: <strong>{{ deleteResult.datasetsTransferred || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-trash" />
                    Datasets deleted: <strong>{{ deleteResult.datasetsDeleted || 0 }}</strong>
                </div>
                <div class="result-item">
                    <i class="fa-solid fa-clock" />
                    Batches deleted: <strong>{{ deleteResult.batchesDeleted || 0 }}</strong>
                </div>
            </div>

            <div class="buttons mt-3 text-end">
                <Button icon="fa-solid fa-check" label="OK" @click="closeDeleteResultDialog" />
            </div>
        </Window>
    </div>
</template>

<script>
import EmptyState from '@/components/EmptyState.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/HubMessage.vue';
import Window from '@/components/HubWindow.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DialogHost from '@/components/DialogHost.vue';
import AddUserDialog from './AddUserDialog.vue';
import EditUserDialog from './EditUserDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';
import OrganizationsDialog from './OrganizationsDialog.vue';
import RoleManagementDialog from './RoleManagementDialog.vue';
import OrganizationManagementDialog from './OrganizationManagementDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Chip from 'primevue/chip';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressBar from 'primevue/progressbar';
import SearchField from '@/components/SearchField.vue';
import reg from '@/libs/api/sharedRegistry';
import { bytesToSize } from '@/libs/utils';
import { formatDateTime, UNKNOWN } from '@/libs/format';
import { deleteConfirmation } from '@/libs/deleteConfirmation';
import { isUnauthorized } from '@/libs/ddb/apiError';
import { stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS } from '@/libs/responsiveColumns';
import { useStackedLayout } from '@/composables/useStackedLayout';
import { isDisabledUser, pickableRoles, publishesSystemRoles } from '@/libs/roles';
import { escapeHtml } from '@/libs/sanitize';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';

/**
 * Users - Admin panel for managing platform users.
 *
 * Lists all registered users in a paginated DataTable. Provides dialogs for
 * adding, editing, and deleting users, and a per-user role management dialog.
 */
export default {
    name: 'UsersPage',
    components: {
        EmptyState,
        LoadingSpinner,
        Message,
        Window,
        ConfirmDialog,
        DialogHost,
        AddUserDialog,
        EditUserDialog,
        ChangePasswordDialog,
        OrganizationsDialog,
        RoleManagementDialog,
        OrganizationManagementDialog,
        Button,
        PrimeMessage,
        Chip,
        Tag,
        Select,
        DataTable,
        Column,
        ProgressBar,
        SearchField
    },
    setup() {
        const dialogs = useDialogs();
        // Below `sm` the rows are cards and the hidden header's sortable cells leave the tab order (D-026)
        return { stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS, stacked: useStackedLayout(), dialogs, confirm: useConfirm(dialogs) };
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
    computed: {
        // A Registry that lists its system roles has the disable and enable endpoints; an older one does not
        canDisableUsers() {
            return publishesSystemRoles();
        },
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
        // Title, body and buttons from the delete-text builder; the body says what goes with
        // the user when no successor takes their data
        deleteDialog() {
            const user = this.userToDelete;
            if (!user) return { message: '' };
            // The row counts every organization the user is a member of, while a delete removes
            // only the ones they own: no counts. storageUsed is the size of what they own.
            const lost = this.deleteSuccessor ? [] : [
                'the organizations they own and all their datasets',
                Number.isFinite(user.storageUsed) && `${bytesToSize(user.storageUsed)} of files`
            ].filter(Boolean);
            const { title, message, confirmText, cancelText } = deleteConfirmation({ kind: 'user', items: [user.userName], lost });
            return { title, message, confirmText, cancelText, confirmButtonClass: 'danger' };
        }
    },
    mounted: async function () {
        await this.loadData();
    },

    methods: {
        bytesToSize,
        isDisabledUser,
        pickableRoles,

        async loadData() {
            try {
                this.loading = true;
                const [usersData, rolesData] = await Promise.all([
                    reg.admin.usersDetailed(),
                    reg.admin.userRoles()
                ]);

                this.users = usersData.map(user => ({
                    ...user,
                    editing: false,
                    deleting: false,
                    switching: false
                }));
                this.availableRoles = rolesData;
            } catch (e) {
                if (!isUnauthorized(e)) this.error = e.message;
            }
            this.loading = false;
        },

        async refreshRoles() {
            try {
                this.availableRoles = await reg.admin.userRoles();
            } catch (e) {
                this.error = e.message;
            }
        },

        // The date the user was created; a user created before the Registry stored it has none: "Unknown"
        formatCreated(date) {
            return formatDateTime(date, { placeholder: UNKNOWN });
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

        // Disable blocks sign-in at once: it asks first, as a destructive action
        async disableUser(user) {
            const confirmed = await this.confirm({
                title: `Disable user “${user.userName}”`,
                message: `<strong>${escapeHtml(user.userName)}</strong> will no longer be able to sign in, and their open sessions lose access at once. Their data is kept, and Enable gives the access back.`,
                confirmText: 'Disable',
                danger: true
            });
            if (!confirmed) return;
            await this.switchUser(user, 'disable');
        },

        async enableUser(user) {
            await this.switchUser(user, 'enable');
        },

        // The server refuses to disable your own account or the last active admin (400): its message says so
        async switchUser(user, action) {
            user.switching = true;
            try {
                if (action === 'disable') await reg.admin.disableUser(user.userName);
                else await reg.admin.enableUser(user.userName);
                this.$notify.success(action === 'disable'
                    ? `User "${user.userName}" can no longer sign in`
                    : `User "${user.userName}" can sign in again`, { summary: action === 'disable' ? 'User Disabled' : 'User Enabled' });
                await this.loadData();
            } catch (e) {
                if (isUnauthorized(e)) return;
                this.error = e.message;
                this.$notify.error(`Failed to ${action} user: ${e.message}`);
            } finally {
                user.switching = false;
            }
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
                const result = await reg.admin.deleteUser(
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
                // The result dialog reports the delete: no toast as well
                this.showDeleteResultDialog = true;

            } catch (e) {
                this.$notify.error('Failed to delete user: ' + e.message);
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

        handleCloseChangePassword: function () {
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
    padding: 2.25rem var(--ddb-page-padding-x) var(--ddb-spacing-md);
}

.search-col {
    min-width: 12rem;
}

.user-name {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

/* A phone shows 3 page links and no first/last jump, so the paginator stays on one row */
@media only screen and (max-width: 575.98px) {
    #users :deep(.p-paginator) {
        flex-wrap: wrap;
    }

    #users :deep(.p-paginator-first),
    #users :deep(.p-paginator-last) {
        display: none;
    }
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

</style>
