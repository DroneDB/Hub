<template>
    <div id="users">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div v-else>
            <div class="top-banner" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1>User Management</h1>
                </div>
                <div>
                    <Button @click.stop="showAddUserDialog = true" severity="info" icon="fa-solid fa-plus" label="New User" />
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
                    <div class="actions-col" style="display: flex; gap: 8px;">
                        <Button @click="showRoleManagement = true" icon="fa-solid fa-gears" label="Manage Roles" />
                        <Button @click="showOrganizationManagement = true" icon="fa-solid fa-building" label="Manage Organizations" />
                        <Button @click="refreshUsers" icon="fa-solid fa-arrows-rotate" label="Refresh" />
                    </div>
                </div>
            </div>

            <!-- Users Table -->
            <table class="data-table">
                <thead>
                    <tr>
                        <th @click="sortBy('userName')">
                            <i class="fa-solid fa-user"></i> Username
                            <i v-if="sortColumn === 'userName'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th @click="sortBy('email')">
                            Email
                            <i v-if="sortColumn === 'email'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th>Roles</th>
                        <th @click="sortBy('organizationCount')">
                            Organizations
                            <i v-if="sortColumn === 'organizationCount'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th @click="sortBy('datasetCount')">
                            Datasets
                            <i v-if="sortColumn === 'datasetCount'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th @click="sortBy('storageUsed')">
                            Storage
                            <i v-if="sortColumn === 'storageUsed'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th @click="sortBy('createdDate')">
                            Created
                            <i v-if="sortColumn === 'createdDate'"
                                :class="sortDirection === 'asc' ? 'fa-solid fa-caret-up' : 'fa-solid fa-caret-down'"></i>
                        </th>
                        <th class="center aligned">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="user in paginatedUsers" :key="user.userName" class="clickable-row">
                        <td class="user-name">
                            <strong>{{ user.userName }}</strong>
                        </td>
                        <td>{{ user.email || '-' }}</td>
                        <td>
                            <div v-if="user.roles && user.roles.length > 0">
                                <Tag v-for="role in user.roles" :key="role" :value="role" severity="info" style="margin: 1px;" />
                            </div>
                            <span v-else class="text-muted">No roles</span>
                        </td>
                        <td>
                            <Button @click="showUserOrganizations(user)" size="small" title="Manage Organizations"
                              icon="fa-solid fa-sitemap" :label="String(user.organizationCount)" />
                        </td>
                        <td>{{ user.datasetCount }}</td>
                        <td>
                            <div v-if="user.storageQuota">
                                {{ bytesToSize(user.storageUsed) }} / {{ bytesToSize(user.storageQuota) }}
                                <ProgressBar :value="getStoragePercentage(user)" style="height: 6px; margin-top: 4px;" />
                            </div>
                            <div v-else>
                                {{ bytesToSize(user.storageUsed) }} / Unlimited
                            </div>
                        </td>
                        <td>{{ formatDate(user.createdDate) }}</td>
                        <td class="center aligned">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                            <Button @click.stop="editUser(user)" severity="info" size="small"
                                :loading="user.editing" :disabled="user.editing || user.deleting"
                                title="Edit User" icon="fa-solid fa-pen-to-square" />
                            <Button @click.stop="changePassword(user)" severity="warn" size="small"
                                :disabled="user.editing || user.deleting" title="Change Password"
                                icon="fa-solid fa-key" />
                            <Button @click.stop="handleDelete(user)" severity="danger" size="small"
                                :loading="user.deleting"
                                :disabled="user.deleting || user.editing || user.userName === 'admin'"
                                title="Delete User" icon="fa-solid fa-trash" />
                            </div>
                        </td>
                    </tr>
                    <tr v-if="paginatedUsers.length === 0">
                        <td colspan="8" class="center aligned">
                            <h3>No users found</h3>
                            <p>{{ searchQuery ? 'Try adjusting your search criteria.' : 'No users available.' }}</p>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="8">
                            <div class="table-footer">
                                <div class="footer-left">
                                    Showing {{ paginatedUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0 }} to
                                    {{ Math.min(currentPage * itemsPerPage, filteredUsers.length) }} of {{
                                    filteredUsers.length }} users
                                </div>
                                <div class="footer-center">
                                    <Paginator v-if="totalPages > 1"
                                        :rows="itemsPerPage"
                                        :totalRecords="filteredUsers.length"
                                        :first="(currentPage - 1) * itemsPerPage"
                                        @page="onPageChange" />
                                </div>
                                <div class="footer-right">
                                    Items per page
                                    <Select v-model="itemsPerPage" :options="itemsPerPageOptions" optionLabel="label" optionValue="value" style="margin-left: 5px; width: 80px;" />
                                </div>
                            </div>
                        </th>
                    </tr>
                </tfoot>
            </table>
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

            <div class="buttons" style="margin-top: 16px; text-align: right;">
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
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import Paginator from 'primevue/paginator';
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
        Tag,
        Select,
        Paginator,
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

            // Sorting
            sortColumn: "userName",
            sortDirection: "asc",

            // Pagination
            currentPage: 1,
            itemsPerPage: 10,
            itemsPerPageOptions: [
                { label: '5', value: 5 },
                { label: '10', value: 10 },
                { label: '25', value: 25 },
                { label: '50', value: 50 },
                { label: '100', value: 100 }
            ],

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
            let filtered = this.users;

            // Filter by search query
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(user => {
                    const userName = (user.userName || '').toLowerCase();
                    const email = (user.email || '').toLowerCase();
                    return userName.includes(query) || email.includes(query);
                });
            }

            // Apply sorting
            const sortMultiplier = this.sortDirection === 'asc' ? 1 : -1;
            filtered.sort((a, b) => {
                if (this.sortColumn === 'userName' || this.sortColumn === 'email') {
                    const aValue = (a[this.sortColumn] || '').toLowerCase();
                    const bValue = (b[this.sortColumn] || '').toLowerCase();
                    return aValue.localeCompare(bValue) * sortMultiplier;
                } else if (this.sortColumn === 'createdDate') {
                    return (new Date(a[this.sortColumn]) - new Date(b[this.sortColumn])) * sortMultiplier;
                } else {
                    return (a[this.sortColumn] - b[this.sortColumn]) * sortMultiplier;
                }
            });

            return filtered;
        },
        // Pagination
        paginatedUsers: function () {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return this.filteredUsers.slice(start, end);
        },
        totalPages: function () {
            return Math.ceil(this.filteredUsers.length / this.itemsPerPage);
        },
        displayedPages: function () {
            if (this.totalPages <= 5) {
                return Array.from({ length: this.totalPages }, (_, i) => i + 1);
            }

            const pages = [];
            const range = 1;

            pages.push(1);

            if (this.currentPage > 2 + range) {
                pages.push('ellipsis-1');
            }

            const startPage = Math.max(2, this.currentPage - range);
            const endPage = Math.min(this.totalPages - 1, this.currentPage + range);

            for (let i = startPage; i <= endPage; i++) {
                pages.push(i);
            }

            if (this.currentPage < this.totalPages - 1 - range) {
                pages.push('ellipsis-2');
            }

            if (this.totalPages > 1) {
                pages.push(this.totalPages);
            }

            return pages;
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
    watch: {
        itemsPerPage: function () {
            this.currentPage = 1;
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

        sortBy(column) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
        },

        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
            }
        },

        onPageChange(event) {
            this.currentPage = event.page + 1;
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

                console.log('User deleted successfully', result);

            } catch (e) {
                console.error('Error deleting user:', e);
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
    margin: 12px;
    margin-top: 36px;
}

.top-banner {
    margin-bottom: 12px;
}

.controls-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}

.table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
}

.user-name {
    font-weight: bold;
}

.clickable-row:hover {
    background-color: #f5f5f5;
    cursor: pointer;
}

.text-muted {
    color: #999;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
}

.data-table th,
.data-table td {
    padding: 8px 12px;
    border: 1px solid #ddd;
    text-align: left;
}

.data-table th {
    cursor: pointer;
    background: #f9fafb;
    user-select: none;
}

.data-table th:hover {
    background: #f0f0f0;
}

.center.aligned {
    text-align: center;
}

.delete-options .field {
    margin-bottom: 12px;
}

.radio-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}

.radio-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.delete-result-details .detail-section {
    margin-bottom: 12px;
}

.delete-result-details .detail-section ul {
    margin: 4px 0;
    padding-left: 20px;
}
</style>
