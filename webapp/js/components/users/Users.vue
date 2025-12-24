<template>
    <div id="users">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div v-else>
            <div class="top-banner ui equal width grid middle aligned">
                <div class="column">
                    <h1>User Management</h1>
                </div>
                <div class="column right aligned">
                    <button @click.stop="showAddUserDialog = true" class="ui primary button icon">
                        <i class="ui icon add"></i>&nbsp;New User
                    </button>
                </div>
            </div>

            <!-- User Controls -->
            <div class="">
                <div class="ui stackable grid">
                    <div class="eight wide column">
                        <div class="ui icon input fluid">
                            <input v-model="searchQuery" type="text" placeholder="Search users...">
                            <i class="search icon"></i>
                        </div>
                    </div>
                    <!-- align right -->
                    <div class="eight wide column right aligned">
                        <button @click="showRoleManagement = true" class="ui button">
                            <i class="ui icon cogs"></i> Manage Roles
                        </button>
                        <button @click="showOrganizationManagement = true" class="ui button">
                            <i class="ui icon building"></i> Manage Organizations
                        </button>
                        <button @click="refreshUsers" class="ui button">
                            <i class="ui icon refresh"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>

            <!-- Users Table -->
            <table class="ui selectable sortable celled table">
                <thead>
                    <tr>
                        <th @click="sortBy('userName')">
                            <i class="user icon"></i> Username
                            <i v-if="sortColumn === 'userName'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('email')">
                            Email
                            <i v-if="sortColumn === 'email'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th>Roles</th>
                        <th @click="sortBy('organizationCount')">
                            Organizations
                            <i v-if="sortColumn === 'organizationCount'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('datasetCount')">
                            Datasets
                            <i v-if="sortColumn === 'datasetCount'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('storageUsed')">
                            Storage
                            <i v-if="sortColumn === 'storageUsed'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('createdDate')">
                            Created
                            <i v-if="sortColumn === 'createdDate'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
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
                                <div v-for="role in user.roles" :key="role" class="ui mini label">
                                    {{ role }}
                                </div>
                            </div>
                            <span v-else class="text-muted">No roles</span>
                        </td>
                        <td>
                            <button @click="showUserOrganizations(user)" class="ui mini button icon" title="Manage Organizations">
                              <i class="sitemap icon" style="margin-right: 1rem"></i>&nbsp;{{ user.organizationCount }}</button>
                        </td>
                        <td>{{ user.datasetCount }}</td>
                        <td>
                            <div v-if="user.storageQuota">
                                {{ bytesToSize(user.storageUsed) }} / {{ bytesToSize(user.storageQuota) }}
                                <div class="ui tiny progress" :data-percent="getStoragePercentage(user)">
                                    <div class="bar" :style="{ width: getStoragePercentage(user) + '%' }"></div>
                                </div>
                            </div>
                            <div v-else>
                                {{ bytesToSize(user.storageUsed) }} / Unlimited
                            </div>
                        </td>
                        <td>{{ formatDate(user.createdDate) }}</td>
                        <td class="center aligned">
                            <button @click.stop="editUser(user)" class="ui button icon small blue"
                                :class="{ loading: user.editing }" :disabled="user.editing || user.deleting"
                                title="Edit User">
                                <i class="ui icon edit"></i>
                            </button>
                            <button @click.stop="changePassword(user)" class="ui button icon small orange"
                                :disabled="user.editing || user.deleting" title="Change Password">
                                <i class="ui icon key"></i>
                            </button>
                            <button @click.stop="handleDelete(user)" class="ui button icon small negative"
                                :class="{ loading: user.deleting }"
                                :disabled="user.deleting || user.editing || user.userName === 'admin'"
                                title="Delete User">
                                <i class="ui icon trash"></i>
                            </button>
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
                            <div class="ui grid three column">
                                <div class="column left aligned middle aligned">
                                    <div class="ui left floated">
                                        Showing {{ paginatedUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0 }} to
                                        {{ Math.min(currentPage * itemsPerPage, filteredUsers.length) }} of {{
                                        filteredUsers.length }} users
                                    </div>
                                </div>
                                <div class="column center aligned middle aligned">
                                    <div v-if="totalPages > 1" class="ui pagination menu">
                                        <a class="item" @click="changePage(1)" :class="{ disabled: currentPage === 1 }">
                                            <i class="angle double left icon"></i>
                                        </a>
                                        <a class="item" @click="changePage(currentPage - 1)"
                                            :class="{ disabled: currentPage === 1 }">
                                            <i class="angle left icon"></i>
                                        </a>
                                        <a v-for="(page, index) in displayedPages" :key="'page-' + index" class="item"
                                            @click="page === 'ellipsis-1' || page === 'ellipsis-2' ? null : changePage(page)"
                                            :class="{ active: currentPage === page, disabled: page === 'ellipsis-1' || page === 'ellipsis-2' }">
                                            {{ page === 'ellipsis-1' || page === 'ellipsis-2' ? '...' : page }}
                                        </a>
                                        <a class="item" @click="changePage(currentPage + 1)"
                                            :class="{ disabled: currentPage === totalPages }">
                                            <i class="angle right icon"></i>
                                        </a>
                                        <a class="item" @click="changePage(totalPages)"
                                            :class="{ disabled: currentPage === totalPages }">
                                            <i class="angle double right icon"></i>
                                        </a>
                                    </div>
                                </div>
                                <div class="column right aligned middle aligned">
                                    <div class="ui right floated">
                                        Items per page
                                        <select v-model="itemsPerPage" style="margin-left: 5px" class="ui dropdown compact">
                                            <option value="5">5</option>
                                            <option value="10">10</option>
                                            <option value="25">25</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                        </select>
                                    </div>
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
        <div v-if="showDeleteDialog" class="ui dimmer modals page transition visible active" style="display: flex !important; align-items: center; justify-content: center;">
            <div class="ui small modal transition visible active" style="position: relative; top: auto; left: auto; margin: 0;">
                <i class="close icon" @click="showDeleteDialog = false"></i>
                <div class="header">
                    <i class="trash icon"></i>
                    Delete User
                </div>
                <div class="content">
                    <p>Are you sure you want to delete user <strong>{{ userToDelete && userToDelete.userName }}</strong>?</p>
                    <p class="ui warning message">
                        <i class="warning icon"></i>
                        This action cannot be undone. All user data and access will be permanently removed.
                    </p>
                </div>
                <div class="actions">
                    <button class="ui button" @click="showDeleteDialog = false">
                        Cancel
                    </button>
                    <button class="ui red button" @click="confirmDelete" :class="{ loading: userToDelete && userToDelete.deleting }">
                        <i class="trash icon"></i>
                        Delete User
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import Message from '../Message.vue';
import AddUserDialog from './AddUserDialog.vue';
import EditUserDialog from './EditUserDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';
import OrganizationsDialog from './OrganizationsDialog.vue';
import RoleManagementDialog from './RoleManagementDialog.vue';
import OrganizationManagementDialog from './OrganizationManagementDialog.vue';
import reg from '../../libs/sharedRegistry';
import { bytesToSize } from '../../libs/utils';

export default {
    components: {
        Message,
        AddUserDialog,
        EditUserDialog,
        ChangePasswordDialog,
        OrganizationsDialog,
        RoleManagementDialog,
        OrganizationManagementDialog
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
            userToDelete: null,
            currentUser: null,

            // Sorting
            sortColumn: "userName",
            sortDirection: "asc",

            // Pagination
            currentPage: 1,
            itemsPerPage: 10,

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
            this.showDeleteDialog = true;
        },

        async confirmDelete() {
            if (!this.userToDelete) return;

            try {
                this.userToDelete.deleting = true;

                // Perform the delete operation
                const result = await reg.deleteUser(this.userToDelete.userName);

                // Remove user from list
                this.users = this.users.filter(u => u.userName !== this.userToDelete.userName);

                // Close dialog and reset state on successful deletion
                this.showDeleteDialog = false;
                this.userToDelete = null;

                console.log('User deleted successfully');

            } catch (e) {
                console.error('Error deleting user:', e);
                this.error = e.message;
                if (this.userToDelete) {
                    this.userToDelete.deleting = false;
                }
                // Don't close dialog on error so user can see the error message
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

.ui.progress {
    margin: 4px 0;
}

.ui.progress .bar {
    transition: width 0.3s ease;
}

.ui.mini.label {
    margin: 1px;
}
</style>
