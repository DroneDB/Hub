<template>
    <div id="users" ref="page" class="page-scroll page-scroll-column">
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

            <!-- The users selected in the table, and what can be done to all of them at once (FR-ADM-23) -->
            <div v-if="selectedUsers.length" class="bulk-bar" role="region" aria-label="Actions for the selected users">
                <span class="bulk-count" role="status">{{ countOf(selectedUsers.length, 'user') }} selected</span>
                <Button severity="secondary" size="small" icon="fa-solid fa-user-tag" label="Add role" @click="bulkMode = 'role'" />
                <Button severity="secondary" size="small" icon="fa-solid fa-building" label="Add to organization" @click="bulkMode = 'organization'" />
                <Button v-if="canDisableUsers && activeSelected.length" severity="warn" size="small" icon="fa-solid fa-user-slash"
                        label="Disable" :disabled="bulkBusy" @click="bulkDisable" />
                <Button v-if="canDisableUsers && disabledSelected.length" severity="secondary" size="small" icon="fa-solid fa-user-check"
                        label="Enable" :disabled="bulkBusy" @click="bulkEnable" />
                <Button severity="danger" size="small" icon="fa-solid fa-trash" label="Delete" :disabled="bulkBusy" @click="bulkDelete" />
                <Button text size="small" label="Clear selection" @click="selected = []" />
            </div>

            <!-- Users Table -->
            <!-- A page holds the rows that fit the height, or the rows the user chose (FR-ADM-29) -->
            <DataTable ref="table" v-model:first="first" :value="filteredUsers" data-key="userName" :class="STACKED_TABLE_CLASS"
                       paginator :rows="pageSize" :page-link-size="3"
                       :always-show-paginator="false"
                       paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
                       sort-field="userName" :sort-order="1"
                       striped-rows row-hover @page="onPage">
                <!-- The size that fits reads "N (fit)": picking it stores no size (FR-XC-34) -->
                <template #paginatorend>
                    <Select :model-value="pageSize" :options="pageSizeChoices" option-label="label" option-value="value"
                            aria-label="Users per page" class="page-size-select" @update:model-value="rows => onPage({ rows })" />
                </template>
                <!-- The checkbox of a row (not for the built-in admin); the header one selects every user that the search shows -->
                <Column class="users-col-fit users-col-select" v-bind="stackedColumn(undefined, undefined, {}, {})">
                    <template #header>
                        <Checkbox :model-value="allSelected" :indeterminate="someSelected" binary input-id="users-select-all"
                                  aria-label="Select all users" :disabled="!selectableUsers.length" @update:model-value="toggleAll" />
                    </template>
                    <template #body="slotProps">
                        <Checkbox v-if="selectableUser(slotProps.data)" :model-value="selected.includes(slotProps.data.userName)" binary
                                  :aria-label="`Select ${slotProps.data.userName}`" @update:model-value="toggleUser(slotProps.data, $event)" />
                    </template>
                </Column>
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
                <Column field="organizationCount" header="Organizations" :sortable="true" class="users-col-fit" v-bind="stackedColumn('Organizations', 'md', {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        <Button size="small" :title="organizationsLabel(slotProps.data)" :aria-label="organizationsLabel(slotProps.data)"
                                severity="secondary" icon="fa-solid fa-sitemap"
                                :label="String(slotProps.data.organizationCount)" @click="showUserOrganizations(slotProps.data)" />
                    </template>
                </Column>
                <Column field="datasetCount" header="Datasets" :sortable="true" class="users-col-fit" v-bind="stackedColumn('Datasets', 'lg', {}, sortableHeaderPt(stacked))" />
                <Column field="storageUsed" header="Storage" :sortable="true" class="users-col-fit" v-bind="stackedColumn('Storage', undefined, {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        <!-- The bar is amber from 90 % and red from 100 % (D-030); with no quota there is no bar -->
                        <div v-if="!usageOf(slotProps.data).unlimited">
                            {{ usageOf(slotProps.data).usedText }} / {{ usageOf(slotProps.data).totalText }}
                            <ProgressBar :value="usageOf(slotProps.data).barValue" :show-value="false" style="height: 1rem;" class="mt-1"
                                         :aria-label="`Storage used by ${slotProps.data.userName}`"
                                         :aria-valuetext="`${usageOf(slotProps.data).percentText} used`"
                                         :pt="{ value: { style: { background: usageOf(slotProps.data).color } } }" />
                            <small v-if="usageOf(slotProps.data).severity !== 'ok'" class="storage-warning"
                                   :style="{ color: usageOf(slotProps.data).color }">{{ usageOf(slotProps.data).percentText }} used</small>
                        </div>
                        <div v-else>
                            {{ usageOf(slotProps.data).usedText }} / Unlimited
                        </div>
                    </template>
                </Column>
                <Column field="createdDate" header="Created" :sortable="true" class="users-col-fit" v-bind="stackedColumn('Created', 'xl', {}, sortableHeaderPt(stacked))">
                    <template #body="slotProps">
                        {{ formatCreated(slotProps.data.createdDate) }}
                    </template>
                </Column>
                <Column header="Actions" class="users-col-fit" v-bind="stackedColumn(undefined, undefined, { style: 'text-align: center' }, { columnHeaderContent: { style: 'display: flex; justify-content: center' } })">
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
                            <!-- Off while it is busy or the user cannot be deleted; the reason of the rule is what the button says -->
                            <ActionButton severity="danger" size="small" :loading="slotProps.data.deleting" label="Delete User"
                                          icon="fa-solid fa-trash"
                                          :disabled="slotProps.data.deleting || slotProps.data.editing || !!userDeleteBlockReason(slotProps.data)"
                                          :disabled-reason="userDeleteBlockReason(slotProps.data) ?? ''"
                                          @click.stop="handleDelete(slotProps.data)" />
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

        <!-- Delete User Confirmation Dialog: one user, or the selected ones with the same choices (FR-ADM-17, FR-ADM-23) -->
        <!-- Deleting all the data asks for the user name (several users: their number) to be typed; a transfer does not -->
        <ConfirmDialog v-if="showDeleteDialog"
                       v-bind="deleteDialog"
                       @close="handleDeleteDialogClose">
            <template #extra>
                <UserDeleteOptions v-model:successor="deleteSuccessor" v-model:conflict-resolution="deleteConflictResolution"
                                   :choices="successorOptions" :several="usersToDelete.length > 1" />
            </template>
        </ConfirmDialog>

        <!-- Add role / Add to organization for the selected users -->
        <BulkUsersDialog v-if="bulkMode" :mode="bulkMode" :users="selectedUsers" :available-roles="availableRoles" @close="handleCloseBulk" />

        <!-- Delete Result Dialog -->
        <Window v-if="showDeleteResultDialog" id="deleteResultDialog" :title="deleteResultTitle" modal max-width="50%" fixed-size @close="closeDeleteResultDialog">
            <p v-if="deleteOutcome.done.length === 1">User <strong>{{ deleteOutcome.done[0] }}</strong> has been deleted.</p>
            <p v-else>Deleted {{ countOf(deleteOutcome.done.length, 'user') }}: <strong>{{ deleteOutcome.done.join(', ') }}</strong>.</p>
            <PrimeMessage v-if="deleteOutcome.failed.length" severity="error" role="alert" :closable="false" class="mb-3">
                {{ countOf(deleteOutcome.failed.length, 'user') }} could not be deleted:
                <ul class="mb-0">
                    <li v-for="failure in deleteOutcome.failed" :key="failure.userName"><strong>{{ failure.userName }}</strong>: {{ failure.message }}</li>
                </ul>
            </PrimeMessage>

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
import BulkUsersDialog from './BulkUsersDialog.vue';
import UserDeleteOptions from './UserDeleteOptions.vue';
import EditUserDialog from './EditUserDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';
import OrganizationsDialog from './OrganizationsDialog.vue';
import RoleManagementDialog from './RoleManagementDialog.vue';
import OrganizationManagementDialog from './OrganizationManagementDialog.vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ActionButton from '@/components/ActionButton.vue';
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
import { formatDateTime, countOf, UNKNOWN } from '@/libs/format';
import { confirmDialogProps } from '@/libs/deleteConfirmation';
import { storageUsage } from '@/libs/storageUsage';
import { selectableUser, successorChoices, bulkSummary, sumDeleteResults } from '@/libs/userBulk';
import { userDeleteBlockReason } from '@/libs/deleteBlockReason';
import { isUnauthorized } from '@/libs/ddb/apiError';
import { stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS } from '@/libs/responsiveColumns';
import { useStackedLayout } from '@/composables/useStackedLayout';
import { isAdminRole, isDisabledUser, pickableRoles, publishesSystemRoles } from '@/libs/roles';
import { Features } from '@/libs/features';
import { escapeHtml } from '@/libs/sanitize';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { usePageSize, visibleListHeight, heightOfFirst, averageRowHeight } from '@/composables/usePageSize';
import { pageStart } from '@/libs/pageSize';
import { PREF } from '@/libs/preferences';
import { getAdminPageSize, saveAdminPageSize } from '@/libs/storageUtils';
import { ref } from 'vue';

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
        BulkUsersDialog,
        UserDeleteOptions,
        EditUserDialog,
        ChangePasswordDialog,
        OrganizationsDialog,
        RoleManagementDialog,
        OrganizationManagementDialog,
        Button,
        Checkbox,
        ActionButton,
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
        // A page holds the rows that fit the height until the user chooses a size, which stays across visits (FR-XC-34)
        const table = ref(null);
        const page = ref(null);
        const sizing = usePageSize({
            height: () => visibleListHeight({
                area: page.value, list: table.value,
                reserved: () => heightOfFirst(table.value, '.p-datatable-thead', 45) + heightOfFirst(table.value, '.p-paginator', 56)
            }),
            rowHeight: () => averageRowHeight(table.value, 'tbody tr', 60),
            initial: getAdminPageSize(PREF.ADMIN_USERS)
        });
        // Below `sm` the rows are cards and the hidden header's sortable cells leave the tab order (D-026)
        return { stackedColumn, sortableHeaderPt, STACKED_TABLE_CLASS, stacked: useStackedLayout(), dialogs, confirm: useConfirm(dialogs), userDeleteBlockReason, selectableUser, countOf, ...sizing, table, page };
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
            // The users the Delete question is about: one, or the selected ones
            usersToDelete: [],
            currentUser: null,

            // The user names ticked in the table (FR-ADM-23), and the bulk action that runs
            selected: [],
            bulkBusy: false,
            // 'role' or 'organization' while its dialog is open
            bulkMode: null,

            // Delete options
            deleteSuccessor: null,
            deleteConflictResolution: 'Rename',
            deleteResult: null,
            // Which users the delete removed, and which it could not
            deleteOutcome: { done: [], failed: [] },

            // The offset of the first user of the page shown
            first: 0,

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
        // The users ticked, as the rows now are
        selectedUsers() {
            return this.users.filter(user => this.selected.includes(user.userName));
        },
        activeSelected() {
            return this.selectedUsers.filter(user => !isDisabledUser(user));
        },
        disabledSelected() {
            return this.selectedUsers.filter(isDisabledUser);
        },
        // The users the header checkbox selects: those the search shows, but the built-in admin
        selectableUsers() {
            return this.filteredUsers.filter(selectableUser);
        },
        allSelected() {
            return this.selectableUsers.length > 0 && this.selectableUsers.every(user => this.selected.includes(user.userName));
        },
        someSelected() {
            return !this.allSelected && this.selectableUsers.some(user => this.selected.includes(user.userName));
        },
        // Who can take the data over: not one of the users being deleted, and not a disabled user
        successorOptions() {
            return successorChoices(this.users, this.usersToDelete.map(user => user.userName));
        },
        // Title, body and buttons from the delete-text builder; the body says what goes with the user, or with the
        // users, when no successor takes their data
        deleteDialog() {
            const users = this.usersToDelete;
            if (!users.length) return { message: '' };
            // The row counts every organization the user is a member of, while a delete removes
            // only the ones they own: no counts. storageUsed is the size of what they own.
            const stored = users.map(user => user.storageUsed);
            const lost = this.deleteSuccessor ? [] : [
                'the organizations they own and all their datasets',
                stored.every(Number.isFinite) && `${bytesToSize(stored.reduce((sum, size) => sum + size, 0))} of files`
            ].filter(Boolean);
            // Deleting all the data asks for the user name to be typed (several users: how many); a transfer does not
            return confirmDialogProps({ kind: 'user', items: users.map(user => user.userName), lost, typed: !this.deleteSuccessor });
        },
        deleteResultTitle() {
            const { done, failed } = this.deleteOutcome;
            if (!failed.length && done.length === 1) return 'User Deleted Successfully';
            return failed.length ? `${done.length} of ${done.length + failed.length} users deleted` : `${done.length} users deleted`;
        }
    },
    watch: {
        // The size that fits changed (the window was resized): the page that holds the first user shown
        pageSize(size) {
            this.first = pageStart(this.first, size);
        },
        // Another search is another list: its first page
        searchQuery() {
            this.first = 0;
            // A bulk action must not reach users that the search no longer shows
            this.selected = this.selected.filter(name => this.filteredUsers.some(user => user.userName === name));
        }
    },

    mounted: async function () {
        await this.loadData();
        // The rows are on the page: their height may differ from the one expected, and so the size that fits
        await this.$nextTick();
        this.measurePageSize();
    },

    methods: {
        bytesToSize,
        // The quota is a bar only where the server applies it: the storage limiter is on and the user is not an administrator
        usageOf: user => storageUsage(user.storageUsed, reg.features.get(Features.STORAGE_LIMITER) && !(user.roles ?? []).some(isAdminRole) ? user.storageQuota : null),
        // 'Manage organizations of tadminuser (2)': the name of the button, which shows only the number (FR-ADM-09)
        organizationsLabel: user => `Manage organizations of ${user.userName} (${user.organizationCount})`,
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
                // A user that is gone is not selected any more
                this.selected = this.selected.filter(name => this.users.some(user => user.userName === name));
            } catch (e) {
                if (!isUnauthorized(e)) this.error = e.message;
            }
            this.loading = false;
        },

        /** A page of the paginator, or a size picked there: the user's choice is kept (the page itself is v-model:first) */
        onPage(event) {
            if (event.rows === this.pageSize) return;
            this.choosePageSize(event.rows);
            saveAdminPageSize(PREF.ADMIN_USERS, this.pageChoice);
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

        // ---- selection (FR-ADM-23) ----

        toggleUser(user, checked) {
            const others = this.selected.filter(name => name !== user.userName);
            this.selected = checked ? [...others, user.userName] : others;
        },

        // The header checkbox: every user the search shows (but the built-in admin), or none of them
        toggleAll(checked) {
            const shown = this.selectableUsers.map(user => user.userName);
            const others = this.selected.filter(name => !shown.includes(name));
            this.selected = checked ? [...others, ...shown] : others;
        },

        // ---- bulk actions ----

        async bulkDisable() {
            const targets = this.activeSelected;
            const names = targets.map(user => user.userName);
            const confirmed = await this.confirm({
                title: targets.length === 1 ? `Disable user “${names[0]}”` : `Disable ${targets.length} users`,
                message: `<strong>${names.map(escapeHtml).join(', ')}</strong> will no longer be able to sign in, and their open sessions lose access at once. Their data is kept, and Enable gives the access back.`,
                confirmText: 'Disable',
                danger: true
            });
            if (!confirmed) return;
            await this.bulkSwitch(targets, 'disable');
        },

        async bulkEnable() {
            await this.bulkSwitch(this.disabledSelected, 'enable');
        },

        // One request per user, one after the other; the Registry refuses your own account and the last active admin (400)
        async bulkSwitch(targets, action) {
            this.bulkBusy = true;
            const done = [];
            const failed = [];
            for (const user of targets) {
                try {
                    if (action === 'disable') await reg.admin.disableUser(user.userName);
                    else await reg.admin.enableUser(user.userName);
                    done.push(user.userName);
                } catch (e) {
                    if (isUnauthorized(e)) { this.bulkBusy = false; return; }
                    failed.push({ userName: user.userName, message: e.message });
                }
            }
            const text = bulkSummary(action === 'disable' ? 'Disabled' : 'Enabled', { done, failed });
            if (failed.length) this.$notify.warn(text, { summary: action === 'disable' ? 'Disable Users' : 'Enable Users', life: 'long' });
            else this.$notify.success(text, { summary: action === 'disable' ? 'Users Disabled' : 'Users Enabled' });
            this.bulkBusy = false;
            await this.loadData();
        },

        bulkDelete() {
            this.startDelete(this.selectedUsers.filter(selectableUser));
        },

        handleCloseBulk(result) {
            this.bulkMode = null;
            if (result === 'updated') this.loadData();
        },

        // ---- delete ----

        async handleDelete(user) {
            if (userDeleteBlockReason(user)) return;
            this.startDelete([user]);
        },

        // The question for one user or several: the same choices and the same typed confirmation (FR-ADM-17, FR-ADM-23)
        startDelete(users) {
            if (!users.length) return;
            this.usersToDelete = users;
            this.deleteSuccessor = null;
            this.deleteConflictResolution = 'Rename';
            this.deleteResult = null;
            this.deleteOutcome = { done: [], failed: [] };
            this.showDeleteDialog = true;
        },

        async handleDeleteDialogClose(action) {
            if (action === 'confirm') {
                await this.confirmDelete();
            } else {
                this.showDeleteDialog = false;
            }
        },

        // One request per user, one after the other, then one report of what went through and what did not
        async confirmDelete() {
            const users = this.usersToDelete;
            if (!users.length) return;

            const done = [];
            const failed = [];
            const results = [];
            for (const user of users) {
                try {
                    user.deleting = true;
                    // Perform the delete operation with optional successor
                    results.push(await reg.admin.deleteUser(user.userName, this.deleteSuccessor, this.deleteConflictResolution));
                    done.push(user.userName);
                } catch (e) {
                    failed.push({ userName: user.userName, message: e.message });
                    user.deleting = false;
                }
            }

            // One user that could not be deleted: the question stays open with its error, as it always did
            if (users.length === 1 && failed.length) {
                this.$notify.error('Failed to delete user: ' + failed[0].message);
                this.error = failed[0].message;
                return;
            }

            // Store the result for display: the one of a single delete, or what all of them did
            this.deleteResult = users.length === 1 ? (results[0] ?? null) : sumDeleteResults(results, this.deleteSuccessor);
            this.deleteOutcome = { done, failed };

            // Remove the users from the list and from the selection
            this.users = this.users.filter(u => !done.includes(u.userName));
            this.selected = this.selected.filter(name => !done.includes(name));

            // Close delete dialog and show result dialog
            this.showDeleteDialog = false;
            // The result dialog reports the delete: no toast as well
            this.showDeleteResultDialog = true;
        },

        closeDeleteResultDialog() {
            this.showDeleteResultDialog = false;
            this.deleteResult = null;
            const several = this.usersToDelete.length > 1;
            this.usersToDelete = [];
            // Reload to refresh data if a successor was used, or if several users were deleted
            if (this.deleteSuccessor || several) {
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
/* The side padding is .page-scroll-column's: the content keeps the width of --ddb-page-max-width (FR-ADM-27) */
#users {
    padding-block: 2.25rem var(--ddb-spacing-md);
}

.search-col {
    min-width: 12rem;
    max-width: 28rem;
}

/* The buttons stay at the right edge of the column, not beside the search field */
.actions-col {
    margin-inline-start: auto;
}

/* The columns after Email take the width of their content, so Email is the flexible column and the name and
   its buttons stay near each other; the storage bar is at most 20rem */
@media only screen and (min-width: 576px) {
    #users :deep(.users-col-fit) {
        width: 1%;
        white-space: nowrap;
    }
}

#users :deep(.p-progressbar) {
    max-width: 20rem;
}

.user-name {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

/* The page size select follows the page links */
#users :deep(.p-paginator-content-end) {
    margin-inline-start: 0;
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



/* The users ticked, and what to do to all of them */
.bulk-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-xs);
    margin-bottom: 0.75rem;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-md);
    background: var(--ddb-bg-surface);
}

.bulk-count {
    margin-right: auto;
    font-weight: 600;
}

.storage-warning {
    display: block;
    font-weight: 600;
}

</style>
