<template>
    <div id="datasets" ref="page" :class="{ 'page-column': view !== 'map' }">
        <!-- A list keeps the width of --ddb-page-max-width, centred (FR-XC-33, FR-ORG-24); the map takes the whole screen -->
        <Message v-model="error" />

        <!-- The organization is not there, or not for this user: the page state in place of the header, the toolbar and the table.
             While the page loads, its frame is there with placeholder rows: the page size is measured on it (FR-XC-34) -->
        <ResourceState v-if="loadKind" :kind="loadKind" resource="organization" :name="$route.params.org" />
        <div v-else class="ds-content">
            <!-- Organization header -->
            <div class="org-header">
                <div class="org-header-layout">
                    <!-- Left: identity -->
                    <div class="org-identity">
                        <div class="d-flex align-items-center gap-3">
                            <div class="org-icon-wrapper d-flex align-items-center justify-content-center">
                                <i class="fa-solid fa-sitemap" />
                            </div>
                            <div>
                                <div class="org-title-row">
                                    <Skeleton v-if="loading && !orgInfo" width="16rem" height="2rem" />
                                    <h1 v-else class="my-0">{{ orgName }}</h1>
                                    <Button v-if="canManageOrg" severity="secondary" text rounded size="small" title="Edit Organization" aria-label="Edit Organization" icon="fa-solid fa-pencil" @click.stop="openOrgDialog()" />
                                    <div class="org-tags d-flex align-items-center gap-2 flex-wrap">
                                        <Tag v-if="orgInfo?.owner" rounded severity="secondary" icon="fa-solid fa-user">
                                            {{ orgInfo.owner }}
                                        </Tag>
                                        <VisibilityTag v-if="orgInfo" rounded :visibility="orgInfo?.isPublic ? Visibility.PUBLIC : Visibility.PRIVATE" />
                                        <!-- (the count is not known before the first page) -->
                                        <Tag rounded severity="info" icon="fa-solid fa-database">
                                            {{ loading ? '…' : totalDatasets }}
                                        </Tag>
                                        <Tag v-if="userRole" rounded severity="contrast" icon="fa-solid fa-shield-halved">
                                            {{ userRole }}
                                        </Tag>
                                    </div>
                                </div>
                                <div v-if="orgInfo?.description" class="org-description mt-1">{{ orgInfo.description }}</div>
                            </div>
                        </div>
                    </div>
                    <!-- Right: what the user can do in the organization -->
                    <div v-if="(memberManagementEnabled && canManageOrg) || canCreateDataset" class="org-actions">
                        <Button v-if="memberManagementEnabled && canManageOrg" severity="secondary" outlined size="small" class="org-secondary-action"
                                title="Manage Members" aria-label="Manage members" icon="fa-solid fa-users" label="Members" @click.stop="openMembersDialog()" />
                        <Button v-if="canCreateDataset" severity="secondary" outlined size="small" class="org-secondary-action"
                                title="Import Dataset" aria-label="Import dataset" icon="fa-solid fa-download" label="Import" @click.stop="openImportDialog()" />
                        <Button v-if="canCreateDataset" severity="primary" size="small" class="org-primary-action"
                                icon="fa-solid fa-plus" label="Create Dataset" @click.stop="handleNew()" />
                    </div>
                </div>
            </div>

            <!-- How the datasets are shown: the search, the datasets without a location, list or map -->
            <ListToolbar ref="searchField" v-model:search="searchQuery" :search-label="view === 'list' ? 'Search datasets' : ''">
                <template #end>
                    <UnlocatedDatasetsButton v-if="view === 'map'" :groups="locationGroups" />
                    <ViewSelect v-model="view" label="Show the datasets as" />
                </template>
            </ListToolbar>

            <!-- While the first page loads: placeholder rows in the place of the table, under its real header -->
            <DataTable v-if="loading" ref="table" :value="skeletonRows" striped-rows class="ds-table ds-table-skeleton" aria-busy="true">
                <Column header="" style="width: 3.75rem;">
                    <template #body><Skeleton width="2.5rem" height="2.5rem" /></template>
                </Column>
                <Column>
                    <template #header><i class="fa-solid fa-database" /> Dataset</template>
                    <template #body><Skeleton width="70%" /><Skeleton width="50%" height="0.75rem" class="mt-1" /></template>
                </Column>
                <Column header="Creation Date" v-bind="columnFrom(COLUMNS_FROM.creationDate)">
                    <template #body><Skeleton width="6rem" /></template>
                </Column>
                <Column header="Modified" v-bind="columnFrom(COLUMNS_FROM.lastModified)">
                    <template #body><Skeleton width="6rem" /></template>
                </Column>
                <Column header="Files" v-bind="columnFrom(COLUMNS_FROM.entries)">
                    <template #body><Skeleton width="2rem" /></template>
                </Column>
                <Column header="Size" v-bind="columnFrom(COLUMNS_FROM.size)">
                    <template #body><Skeleton width="4rem" /></template>
                </Column>
                <Column header="Visibility" v-bind="columnFrom(COLUMNS_FROM.visibility)">
                    <template #body><Skeleton width="5rem" height="1.5rem" border-radius="1rem" /></template>
                </Column>
            </DataTable>
            <!-- Where the datasets are -->
            <DatasetLocationsMap v-else-if="view === 'map'" :groups="locationGroups" :loading="locationsLoading" />
            <!-- Nothing to list: the empty state, not an empty table with its header (FR-ORG-13) -->
            <EmptyState v-else-if="datasets.length === 0" title="No datasets found" items="datasets" :query="searchQuery"
                        class="ds-empty" @clear="searchQuery = ''; $refs.searchField?.focus()">
                <p v-if="canCreateDataset">This organization has no datasets yet. Create one, import one from another Registry, or upload files.</p>
                <template v-if="canCreateDataset" #actions>
                    <Button severity="primary" size="small" icon="fa-solid fa-plus" label="Create dataset" @click="handleNew()" />
                    <Button severity="secondary" size="small" icon="fa-solid fa-download" label="Import" @click="openImportDialog()" />
                    <Button severity="secondary" size="small" icon="fa-solid fa-upload" label="Upload" @click="upload()" />
                </template>
            </EmptyState>
            <!-- Datasets Table -->
            <DataTable v-else ref="table" :value="datasets" :paginator="false" striped-rows
                       row-hover class="ds-table" scrollable scroll-height="flex"
                       :sort-field="sortColumn" :sort-order="sortOrderPrimevue"
                       :pt="{ bodyRow: { style: 'cursor: pointer' } }" @row-click="onRowClick" @row-contextmenu="onRowContextMenu"
                       @sort="onSort">
                <Column header="" style="width: 3.75rem;">
                    <template #body="slotProps">
                        <ProgressSpinner v-if="slotProps.data.loading" class="ds-row-spinner" stroke-width="4" />
                        <img v-else :src="slotProps.data.thumbUrl" alt="" class="ds-thumb-img"
                             :class="{ 'ds-thumb-placeholder': !slotProps.data.thumbLoaded }">
                    </template>
                </Column>
                <Column field="name" :sortable="true" :pt="{ bodyCell: { class: 'ds-name-cell' } }">
                    <template #header>
                        <i class="fa-solid fa-database" /> Dataset
                    </template>
                    <template #body="slotProps">
                        <!-- A link (Tab, Enter, open in a new tab) over the whole cell; Shift+F10 or the Menu key opens the row menu -->
                        <!-- The lock first, on the line of the name: it never wraps alone (FR-ORG-20) -->
                        <span class="ds-name-line">
                            <i v-if="slotProps.data.visibility === Visibility.PRIVATE" class="fa-solid fa-lock d-sm-none"
                               role="img" :aria-label="visibilityLabel(slotProps.data.visibility)" />
                            <router-link :to="{ name: 'ViewDataset', params: { org: $route.params.org, ds: slotProps.data.slug } }"
                                         class="ds-name stretched-link" @keydown="onNameKeydown($event, slotProps.data)">
                                {{ slotProps.data.name || slotProps.data.slug }}
                            </router-link>
                            <!-- An import runs: the row says so, with its progress, from the background-task store (FR-UPL-10) -->
                            <Tag v-if="slotProps.data.slug in importProgress" severity="info" rounded class="ds-importing" role="status"
                                 icon="fa-solid fa-circle-notch fa-spin">
                                {{ importingText(slotProps.data.slug) }}
                            </Tag>
                        </span>
                        <div v-if="slotProps.data.tagline" class="ds-tagline">{{ slotProps.data.tagline }}</div>
                    </template>
                </Column>
                <Column field="creationDate" header="Creation Date" :sortable="true" class="ds-col-date"
                        v-bind="columnFrom(COLUMNS_FROM.creationDate)"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <div class="file-date">
                            <div>{{ formatDateTime(slotProps.data.creationDate) }}</div>
                            <small class="relative-time">{{ formatCreationDateRel(slotProps.data.creationDate) }}</small>
                        </div>
                    </template>
                </Column>
                <Column field="lastModified" header="Modified" :sortable="true" class="ds-col-date"
                        v-bind="columnFrom(COLUMNS_FROM.lastModified)"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <div v-if="slotProps.data.lastModified != null" class="file-date">
                            <div>{{ formatDateTime(slotProps.data.lastModified) }}</div>
                            <small class="relative-time">{{ formatCreationDateRel(slotProps.data.lastModified) }}</small>
                        </div>
                    </template>
                </Column>
                <Column field="entries" header="Files" :sortable="true" class="ds-col-count"
                        v-bind="columnFrom(COLUMNS_FROM.entries)"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }" />
                <Column field="size" header="Size" :sortable="true" class="ds-col-count"
                        v-bind="columnFrom(COLUMNS_FROM.size)"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">{{ bytesToSize(slotProps.data.size) }}</template>
                </Column>
                <Column field="visibility" header="Visibility" :sortable="true" class="ds-col-visibility"
                        v-bind="columnFrom(COLUMNS_FROM.visibility)" :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <VisibilityTag :visibility="slotProps.data.visibility" />
                    </template>
                </Column>
                <Column v-if="showActionsColumn" header="Actions" :pt="{ bodyCell: { style: 'text-align: center; white-space: nowrap' }, columnHeaderContent: { style: 'display: flex; justify-content: center' } }" style="width: 9.5rem;">
                    <template #body="slotProps">
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canWrite"
                                severity="secondary" outlined size="small" :loading="slotProps.data.editing"
                                :disabled="slotProps.data.editing || slotProps.data.deleting" icon="fa-solid fa-pencil"
                                aria-label="Edit dataset" @click.stop="handleEdit(slotProps.data)" />
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canDelete && canDeleteGlobal"
                                severity="danger" size="small" :loading="slotProps.data.deleting"
                                :disabled="slotProps.data.deleting || slotProps.data.editing" icon="fa-solid fa-trash"
                                class="ms-1" aria-label="Delete dataset" @click.stop="handleDelete(slotProps.data)" />
                        <Button severity="secondary" text size="small" icon="fa-solid fa-ellipsis-vertical" class="ms-1 ds-row-menu"
                                aria-haspopup="menu" :aria-expanded="rowMenuOpen && contextMenuDataset === slotProps.data ? 'true' : 'false'"
                                :aria-label="`Actions for ${slotProps.data.name || slotProps.data.slug}`"
                                @click.stop="openRowMenu($event, slotProps.data)" />
                    </template>
                </Column>
            </DataTable>

            <PrimeContextMenu ref="datasetContextMenu" :model="datasetContextMenuItems" @show="rowMenuOpen = true" @hide="onRowMenuHide" />

            <!-- Pagination; while the first page loads the bar is there, hidden, so that the page size counts it -->
            <div v-if="view === 'list' && (loading || totalPages > 0)" class="ds-pagination d-flex justify-content-between align-items-center mt-2 p-2"
                 :class="{ 'ds-pagination-placeholder': loading }" :aria-hidden="loading ? 'true' : undefined">
                <span>
                    Showing {{ datasets.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0 }} to
                    {{ Math.min(currentPage * itemsPerPage, totalDatasets) }} of {{ totalDatasets }} datasets
                </span>
                <Paginator v-if="loading || totalPages > 1" class="ds-paginator"
                           :rows="Number(itemsPerPage)" :total-records="totalDatasets"
                           :first="(currentPage - 1) * itemsPerPage" @page="onPageChange">
                    <!-- The size that fits reads "N (fit)": picking it stores no size (FR-XC-34) -->
                    <template #end>
                        <Select :model-value="itemsPerPage" :options="pageSizeChoices" option-label="label" option-value="value"
                                aria-label="Datasets per page" class="page-size-select"
                                @update:model-value="size => onPageChange({ page: currentPage - 1, rows: size })" />
                    </template>
                </Paginator>
            </div>
        </div>

        <DialogHost :dialogs="dialogs" />
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @close="handleMessageClose" />
        <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbidden-slugs="forbiddenSlugs"
                       :org-slug="$route.params.org" :save="saveDataset" @close="handleDatasetClose" />

        <ImportDatasetDialog v-if="importDialogOpen" :org-slug="$route.params.org" :forbidden-slugs="forbiddenSlugs"
                             @close="handleImportClose" />

        <OrganizationDialog v-if="orgEditDialogOpen" mode="edit" :model="orgDialogModel" :save="saveOrganization"
                            @close="handleOrgDialogClose" />
        <OrganizationMembersDialog v-if="membersDialogOpen"
                                   :org-slug="$route.params.org"
                                   :can-manage-members="orgInfo?.permissions?.canManageMembers || false"
                                   @permissions-changed="reloadOrgInfo"
                                   @close="closeMembersDialog" />

    </div>
</template>

<script>
import EmptyState from '@/components/EmptyState.vue';
import ResourceState from '@/components/ResourceState.vue';
import VisibilityTag from '@/components/VisibilityTag.vue';
import Message from '@/components/HubMessage.vue';
import ViewSelect from '@/components/ViewSelect.vue';
import ListToolbar from '@/components/ListToolbar.vue';
import { DatasetLocationsMap } from './locationsMap';
import UnlocatedDatasetsButton from './UnlocatedDatasetsButton.vue';
import { setTitle, bytesToSize, formatTimeAgo, parseTimestamp } from '@/libs/utils';
import { datasetName } from '@/libs/api/registryUtils';
import { getDatasetTablePreferences, saveDatasetTablePreferences, followDatasetTablePreferences } from '@/libs/storageUtils';
import { shallowRef } from 'vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useEntityDelete } from '@/composables/useEntityDelete';
import DatasetDialog from './DatasetDialog.vue';
import ImportDatasetDialog from './ImportDatasetDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import OrganizationDialog from '@/features/organizations/OrganizationDialog.vue';
import OrganizationMembersDialog from '@/features/organizations/OrganizationMembersDialog.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Paginator from 'primevue/paginator';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import PrimeContextMenu from 'primevue/contextmenu';
import reg from '@/libs/api/sharedRegistry';
import { datasetListQuery } from '@/libs/datasetList';
import { usePageSize, visibleListHeight, heightOfFirst, averageRowHeight, keptBarHeight, elementOf } from '@/composables/usePageSize';
import { pageAfterResize } from '@/libs/pageSize';
import { ref } from 'vue';

// Typing in the search box asks the server once the user pauses
const SEARCH_DELAY_MS = 300;
import { Features } from '@/libs/features';
import { Visibility } from 'ddb';
import { visibilityLabel } from '@/libs/visibility';
import { formatDateTime, formatNumber } from '@/libs/format';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { isUnauthorized, loadErrorKind } from '@/libs/ddb/apiError';
import { columnFrom } from '@/libs/responsiveColumns';
import { hasOpenOverlay } from '@/composables/useOverlay';

// The width each secondary column appears from, shared by the table and its loading skeleton.
// Every column with the actions takes about 790 px, more than a 768 px screen holds: the creation
// date, the widest, waits for 992 px so the actions stay on screen, and the date of the last
// change, as wide, for 1200 px.
const COLUMNS_FROM = Object.freeze({ creationDate: 'lg', lastModified: 'xl', entries: 'md', size: 'sm', visibility: 'sm' });

export default {
    name: 'DatasetsPage',
    components: {
        EmptyState,
        ResourceState,
        Message,
        ViewSelect,
        ListToolbar,
        DatasetLocationsMap,
        UnlocatedDatasetsButton,
        DialogHost,
        MessageDialog,
        DatasetDialog,
        ImportDatasetDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Button,
        DataTable,
        Column,
        Paginator,
        Select,
        Tag,
        VisibilityTag,
        
        ProgressSpinner,
        Skeleton,
        PrimeContextMenu
    },
    setup() {
        const dialogs = useDialogs();
        // A page holds the rows that fit the height until the user chooses a size, which the preferences keep (FR-XC-34)
        const table = ref(null);
        const page = ref(null);
        // The bar below the rows as it is with the paginator (shown, hidden, while the first page loads)
        const paginatorBar = keptBarHeight(page, '.ds-pagination', '.ds-paginator', 80);
        const sizing = usePageSize({
            height: () => visibleListHeight({
                area: page.value, list: table.value,
                reserved: () => heightOfFirst(table.value, 'thead', 45) + paginatorBar()
            }),
            // The placeholder rows are not the height of dataset rows: the known one until the rows are there
            rowHeight: () => (elementOf(table.value)?.classList.contains('ds-table-skeleton') ? 65 : averageRowHeight(table.value, 'tbody tr', 65)),
            initial: getDatasetTablePreferences().itemsPerPage
        });
        // The locations are many small objects the map reads whole: not made reactive
        return { dialogs, deleteEntity: useEntityDelete(dialogs), columnFrom, COLUMNS_FROM, locationGroups: shallowRef([]), ...sizing, table, page };
    },
    data: function () {
        // Load preferences from Local Storage
        const prefs = getDatasetTablePreferences();

        return {
            Visibility,
            skeletonRows: new Array(10).fill({}),
            error: "",
            // The organization did not load: not there, not for this user, or sign in (ResourceState)
            loadError: null,
            // The page shown (the server searches, sorts and pages)
            datasets: [],
            totalDatasets: 0,
            // Every slug of the organization, for the create/rename/import dialogs (loaded when
            // one opens)
            forbiddenSlugs: [],
            loading: true,
            messageDialogOpen: false,
            currentMessage: null,

            dsDialogModel: null,
            dsDialogMode: null,
            dsDialogOpen: false,

            importDialogOpen: false,
            // The imports that run, by dataset slug: their progress (0-100) from the background-task store (FR-UPL-10)
            importProgress: {},

            orgEditDialogOpen: false,
            orgDialogModel: null,
            membersDialogOpen: false,

            contextMenuDataset: null,
            // The row menu is shown (the kebab's aria-expanded)
            rowMenuOpen: false,

            orgName: "",
            orgInfo: null,

            // Sorting - use saved preferences or defaults
            sortColumn: prefs.sortColumn,
            sortDirection: prefs.sortDirection,

            // The table or the map of where the datasets are
            view: prefs.view,
            locationsLoading: false,
            // Pagination - use saved preferences or defaults
            currentPage: 1,

            // Filtering: what is typed, and what the server was asked for
            searchQuery: "",
            searchTerm: ""
        }
    },
    computed: {
        canDeleteGlobal: function () {
            return !HubOptions.disableDatasetCreation;
        },
        canManageOrg: function () {
            return this.orgInfo?.permissions?.canManageMembers || false;
        },
        userRole: function () {
            const p = this.orgInfo?.permissions;
            if (!p) return null;
            if (p.canManageMembers) return 'Admin';
            if (p.canDelete) return 'Editor+';
            if (p.canWrite) return 'Editor';
            if (p.canRead) return 'Viewer';
            return null;
        },
        memberManagementEnabled: function () {
            return reg.features.get(Features.ORGANIZATION_MEMBER_MANAGEMENT);
        },
        // The page state of an organization that did not load (loadErrorKind), or null
        loadKind: function () {
            return loadErrorKind(this.loadError);
        },
        // Check if user can create datasets in this organization: only in an organization that loaded and
        // says the user may write (an older Registry without permissions: a dataset the user may write)
        canCreateDataset: function () {
            if (HubOptions.disableDatasetCreation) return false;
            // An anonymous visitor (a Public organization opens without signing in) creates nothing: the Registry
            // sends them no permissions, which the fallback below would read as an older Registry
            if (!reg.isLoggedIn()) return false;
            // Nothing is offered before the organization loaded, nor when it did not (FR-ACC-02)
            if (!this.orgInfo) return false;
            // The organization says what the user may do: write creates, read only (a Public organization of
            // another user, D-003) does not. Without permissions for a signed-in user (an older Registry) a
            // dataset the user may write decides
            const orgPermissions = this.orgInfo.permissions;
            if (orgPermissions) return orgPermissions.canWrite === true;
            return this.datasets.some(ds => ds.permissions && ds.permissions.canWrite);
        },
        // Show Actions column only if at least one dataset has actions available
        showActionsColumn: function () {
            return this.datasets.some(ds =>
                (ds.permissions && ds.permissions.canWrite) ||
                (ds.permissions && ds.permissions.canDelete && this.canDeleteGlobal)
            );
        },
        datasetContextMenuItems: function () {
            const ds = this.contextMenuDataset;
            if (!ds) return [];

            const items = [{
                label: 'Open',
                icon: 'fa-regular fa-folder-open',
                command: () => { this.viewDataset(ds); }
            }];

            if (ds.permissions && ds.permissions.canWrite) {
                items.push({
                    label: 'Edit',
                    icon: 'fa-solid fa-pencil',
                    command: () => { this.handleEdit(ds); }
                });
            }

            if (ds.permissions && ds.permissions.canDelete && this.canDeleteGlobal) {
                items.push({
                    separator: true
                });
                items.push({
                    label: 'Delete',
                    icon: 'fa-solid fa-trash',
                    command: () => { this.handleDelete(ds); }
                });
            }

            return items;
        },
        // Rows per page: the size the user chose, else the rows that fit the height (FR-XC-34)
        itemsPerPage: function () {
            return this.pageSize;
        },
        // What the server is asked for: changes to any of it load that page
        listQuery: function () {
            return datasetListQuery({
                page: this.currentPage, pageSize: this.itemsPerPage, search: this.searchTerm,
                sortColumn: this.sortColumn, sortDirection: this.sortDirection
            });
        },
        totalPages: function () {
            return Math.ceil(this.totalDatasets / this.itemsPerPage);
        },
        sortOrderPrimevue: function () {
            return this.sortDirection === 'asc' ? 1 : -1;
        }
    },
    watch: {
        // (the first page is asked by mounted, once, with the size that fits by then)
        listQuery: function () {
            if (this._firstPageAsked) this.reloadPage();
        },
        searchQuery: function (value) {
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this.currentPage = 1;
                this.searchTerm = value;
            }, SEARCH_DELAY_MS);
        },
        // Another size: the page that holds the first dataset shown
        itemsPerPage: function (size, previous) {
            this.currentPage = pageAfterResize(this.currentPage, previous, size);
        },
        // Only a size the user chose is a preference
        pageChoice: function () {
            this.savePreferences();
        },
        sortColumn: function () {
            this.currentPage = 1;
            this.savePreferences();
        },
        sortDirection: function () {
            this.currentPage = 1;
            this.savePreferences();
        },
        view: function (view) {
            this.savePreferences();
            // The list is back on the page: measure the rows it shows
            if (view === 'list') this.$nextTick(() => this.measurePageSize());
            if (view === 'map') {
                this.loadLocations();
            } else {
                // Leaving the map ends a request it is still waiting for; the map asks again when shown
                this._locationsRequest?.abort();
                this.locationsLoading = false;
            }
        }
    },
    created() {
        // The imports that run are in the store of the app: the row follows it, and the list reloads when one ends
        // (FR-UPL-10, FR-XC-16). Not reactive on its own: the store tells when its tasks change
        this._onTasksUpdated = () => this.refreshImports();
        this._onImportEnded = ({ dataset }) => {
            if (this.datasets.some(ds => this.org?.Dataset(ds.slug).baseApi === dataset.baseApi)) this.reloadDatasets();
            this.refreshImports();
        };
        taskMonitor.on('tasksUpdated', this._onTasksUpdated);
        taskMonitor.on('importEnded', this._onImportEnded);
        // The table settings follow the Preferences page, other tabs and the account; the watchers
        // above do not store them again (saveDatasetTablePreferences skips the values already stored)
        this._stopFollowingPreferences = followDatasetTablePreferences(prefs => {
            this.sortColumn = prefs.sortColumn;
            this.sortDirection = prefs.sortDirection;
            this.pageChoice = prefs.itemsPerPage;
            this.view = prefs.view;
        });
    },
    mounted: async function () {
        try {
            this.org = reg.Organization(this.$route.params.org);
            const orgInfo = await this.org.info();
            this.orgName = orgInfo.name !== "" ? orgInfo.name : this.$route.params.org;
            this.orgInfo = orgInfo;
            setTitle(this.orgName);
            if (this.view === 'map') this.loadLocations();

            // The header, the toolbar, the table header and the paginator bar are on the page (placeholder rows in
            // the place of the table): the first page asks for the rows that fit, once (FR-XC-34)
            await this.$nextTick();
            this.measurePageSize();
            // (the watchers of the size measured run before the first page is asked: they ask nothing)
            await this.$nextTick();
            this._firstPageAsked = true;
            await this.loadPage();
        } catch (e) {
            // Not there, not for this user, or sign in: the page state says so (with a session, a 401
            // has already sent the user to Login); any other failure is the message
            if (loadErrorKind(e)) this.loadError = e;
            else this.error = e.message;
        }
        this.loading = false;
        this.measureRows();
    },
    beforeUnmount() {
        taskMonitor.off('tasksUpdated', this._onTasksUpdated);
        taskMonitor.off('importEnded', this._onImportEnded);
        this._stopFollowingPreferences?.();
        clearTimeout(this._searchTimer);
        this._listRequest?.abort();
        this._locationsRequest?.abort();
    }, methods: {
        /**
         * Save table preferences to Local Storage
         */
        savePreferences: function () {
            saveDatasetTablePreferences({
                sortColumn: this.sortColumn, sortDirection: this.sortDirection, itemsPerPage: this.pageChoice, view: this.view
            });
        },
        bytesToSize,
        datasetName,
        visibilityLabel,

        formatDateTime,

        formatCreationDateRel(timestamp) {
            if (!timestamp) return '';
            return formatTimeAgo(timestamp);
        },

        onSort(event) {
            this.sortColumn = event.sortField;
            this.sortDirection = event.sortOrder === 1 ? 'asc' : 'desc';
        },

        sortBy(column) {
            if (this.sortColumn === column) {
                // Toggle sort direction if clicking the same column
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // Set new sort column with default ascending direction
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
        },

        handleDelete(ds) {
            this.deleteEntity(ds, {
                kind: 'dataset',
                name: ds.name,
                warning: 'All the files will be deleted too.',
                remove: () => this.org.Dataset(ds.slug).delete(),
                // The next dataset moves into the page
                done: () => this.reloadDatasets()
            });
        },

        showMessage(msg) {
            this.currentMessage = msg;
            this.messageDialogOpen = true;
        },

        handleMessageClose() {
            this.messageDialogOpen = false;
            this.currentMessage = null;
        },

        handleEdit(ds) {
            this.editDataset(ds);
        }, editDataset(ds) {
            // Make sure we pass all required properties to the dialog
            this.dsDialogModel = {
                slug: ds.slug,
                name: ds.name || ds.slug, // Use slug as fallback if name is not available
                visibility: ds.visibility !== undefined ? ds.visibility : Visibility.PRIVATE,
                tagline: ds.tagline || ''
            };
            this.dsDialogMode = "edit";
            this.dsDialogOpen = true;
            this.loadForbiddenSlugs();
        },

        newDataset() {
            this.dsDialogMode = "new";
            this.dsDialogOpen = true;
            this.loadForbiddenSlugs();
        },

        handleNew() {
            this.newDataset();
        },

        openImportDialog() {
            this.importDialogOpen = true;
            this.loadForbiddenSlugs();
        },

        // Adds a placeholder row so the importing dataset shows up immediately in the list.
        addImportingEntry(payload) {
            if (this.datasets.some(ds => ds.slug === payload.slug)) return;
            this.datasets.unshift({
                slug: payload.slug,
                creationDate: Date.now(),
                lastModified: Date.now(),
                visibility: payload.visibility,
                entries: 0,
                size: 0,
                editing: false,
                deleting: false,
                name: payload.name,
                tagline: '',
                permissions: { canRead: true, canWrite: true, canDelete: true },
                thumbError: false,
                thumbLoaded: false,
                thumbUrl: '/images/dataset-placeholder.svg',
                loading: true,
                isTemporary: true
            });
        },

        handleImportClose(action, payload) {
            const slug = payload && payload.slug;

            if (action === 'started') {
                // Keep the dialog open and show the new dataset as importing. The store of the app follows the task from
                // here on: it goes on when the dialog closes ("Run in background") or the page is left
                this.addImportingEntry(payload);
                if (payload.taskId) taskMonitor.trackImport(this.org.Dataset(payload.slug), payload.taskId);
                return;
            }

            this.importDialogOpen = false;

            if (action === 'done') {
                // The toast that says how it ended is the app's, one for every way an import ends (libs/tasks/importNotices,
                // FR-UPL-11): here only the list follows
                if (payload.success) {
                    this.reloadDatasets();
                } else {
                    this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === slug));
                }
            } else if (action === 'background') {
                this.$notify.info(`Import of "${slug}" continues in the background`, { summary: 'Import running', life: 'normal' });
            }
        },

        handleDatasetClose() {
            this.dsDialogOpen = false;
            this.dsDialogModel = null;
        },

        /**
         * The request of the dataset dialog (D-046, FR-XC-11): it runs while the dialog is open, and a failure is thrown for
         * the dialog to show at its field (a slug that is taken: `errors.slug`) or in its form-level message, with the dialog
         * open and what was typed. No toast says it while the dialog is on show.
         */
        saveDataset(newds) {
            return this.dsDialogMode === 'edit' ? this.updateDataset(this.dsDialogModel, newds) : this.createDataset(newds);
        },

        async createDataset(newds) {
            // A row for the dataset that is being made, until the list is read again
            this.datasets.unshift({
                slug: newds.slug,
                creationDate: Date.now(),
                lastModified: Date.now(),
                visibility: newds.visibility,
                entries: 0,
                size: 0,
                editing: false,
                deleting: false,
                name: newds.name,
                tagline: newds.tagline || '',
                permissions: { canRead: true, canWrite: true, canDelete: true },
                thumbError: false,
                thumbLoaded: false,
                thumbUrl: '/images/dataset-placeholder.svg',
                loading: true,
                isTemporary: true
            });

            try {
                const ret = await this.org.createDataset(newds.slug, newds.name, newds.visibility, newds.tagline);
                if (!ret) throw new Error(`Failed to create dataset "${newds.slug}"`);
            } catch (e) {
                this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                throw e;
            }

            // The server places the new dataset in the sort order
            await this.reloadDatasets();
            this.$notify.success('Dataset created successfully', { summary: 'Dataset Created' });

            // Navigate to the newly created dataset if the user has enabled the preference
            if (newds.openAfterCreate) {
                this.$router.push({ name: "ViewDataset", params: { org: this.$route.params.org, ds: newds.slug } });
            }
        },

        async updateDataset(model, newds) {
            const dsitem = this.datasets.find(o => o.slug == model.slug);
            if (dsitem) dsitem['editing'] = true;
            let renamed = false;

            try {
                let dsobj = this.org.Dataset(model.slug);

                // Only a new slug the user asked for (Change URL) renames the dataset: its links change.
                // It goes first, so a refused slug sends nothing else and the dataset stays as it was.
                if (newds.changeSlug && newds.slug && newds.slug !== model.slug) {
                    const ret = await dsobj.rename(newds.slug);
                    const slug = ret?.slug || newds.slug;
                    if (dsitem) dsitem['slug'] = slug;
                    // The dialog stays open when a later step fails: it then edits the dataset at its new slug
                    model.slug = slug;
                    renamed = true;
                    dsobj = this.org.Dataset(slug);
                }

                // The name is the display name: saving it keeps the URL (FR-ORG-08)
                await dsobj.metaSet('name', newds.name);
                renamed = true;

                // Visibility only: the name is saved above
                const update = await dsobj.update(undefined, newds.visibility);

                if (newds.tagline) {
                    await dsobj.metaSet('tagline', newds.tagline);
                } else {
                    await dsobj.metaUnset('tagline');
                }

                if (dsitem) {
                    dsitem['name'] = newds.name;
                    dsitem['visibility'] = newds.visibility;
                    dsitem['tagline'] = newds.tagline || '';
                }
                if (update) this.$notify.success('Dataset updated successfully', { summary: 'Dataset Updated' });
            } finally {
                // The pins know the dataset by its slug and name, which the edit changed
                if (renamed) this.invalidateLocations();
                if (dsitem) dsitem['editing'] = false;
            }
        },

        viewDataset(ds) {

            if (ds.editing || ds.deleting) return;

            this.$router.push({
                name: "ViewDataset", params: {
                    org: this.$route.params.org,
                    ds: ds.slug
                }
            });
        },

        onRowClick(event) {
            // The name link opens the dataset itself (also in a new tab)
            const target = event.originalEvent && event.originalEvent.target;
            if (target instanceof Element && target.closest('a')) return;
            this.viewDataset(event.data);
        },

        onRowContextMenu(event) {
            const e = event.originalEvent;
            // The Menu key on the focused name: at the name, not at the corner of the page
            const fromKeyboard = !e.pageX && !e.pageY && e.target instanceof Element;
            this.contextMenuDataset = event.data;
            this.$refs.datasetContextMenu.show(fromKeyboard ? this.menuEventAt(e, e.target) : e);
        },

        /**
         * The row menu under an element (the kebab, the name): the focus comes back to it when
         * the menu closes without opening anything.
         * @param {Event} event
         * @param {object} ds
         */
        openRowMenu(event, ds) {
            const element = /** @type {HTMLElement} */ (event.currentTarget);
            this.contextMenuDataset = ds;
            this._rowMenuOpener = element;
            this.$refs.datasetContextMenu.show(this.menuEventAt(event, element));
        },

        // What ContextMenu.show reads from a pointer event, at the bottom left of the element
        menuEventAt(event, element) {
            const box = element.getBoundingClientRect();
            return {
                pageX: box.left + window.scrollX,
                pageY: box.bottom + window.scrollY,
                stopPropagation: () => event.stopPropagation(),
                preventDefault: () => event.preventDefault()
            };
        },

        // Shift+F10 or the Menu key on the dataset name
        onNameKeydown(event, ds) {
            if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
            event.preventDefault();
            this.openRowMenu(event, ds);
        },

        // A menu closed with Escape (or a click elsewhere) gives the focus back to its opener,
        // unless one of its items opened a dialog, which has the focus now
        onRowMenuHide() {
            this.rowMenuOpen = false;
            const opener = this._rowMenuOpener;
            this._rowMenuOpener = null;
            const active = document.activeElement;
            const lost = !active || active === document.body || !!active.closest('[role="menubar"], [role="menu"]');
            if (opener && opener.isConnected && lost && !hasOpenOverlay()) opener.focus();
        },

        // A page of the paginator, or a size picked there (the watchers keep the page that holds the first
        // dataset shown, and store the size the user chose)
        onPageChange(event) {
            if (event.rows !== this.itemsPerPage) this.choosePageSize(event.rows);
            else this.currentPage = event.page + 1;
        },

        // The rows are on the page: their height may differ from the one expected, and so the size that fits
        measureRows() {
            if (this._rowsMeasured) return;
            this._rowsMeasured = true;
            this.$nextTick(() => this.measurePageSize());
        },

        upload: function () {
            this.$router.push({ name: "Upload" });
        },

        // One server page with the covers checked for its rows only; a newer request
        // (another page, sort or search) aborts the one in flight
        async loadPage() {
            if (!this.org) return;
            this._listRequest?.abort();
            const request = new AbortController();
            this._listRequest = request;
            try {
                const { items, total } = await this.org.datasetsPage(this.listQuery,
                    { includeThumbnailCheck: true, signal: request.signal });
                if (request.signal.aborted) return;
                this.datasets = items.map(ds => this.toRow(ds));
                this.totalDatasets = total;
                // Past the last page (a dataset was deleted, the search narrowed): show the last one
                if (this.datasets.length === 0 && total > 0 && this.currentPage > 1)
                    this.currentPage = Math.max(1, Math.ceil(total / this.itemsPerPage));
                this.datasets.forEach(ds => this.preloadDatasetThumbnail(ds));
                this.findImports(this.datasets, request.signal);
            } catch (e) {
                if (e.name === 'AbortError') return;
                throw e;
            }
        },

        // The imports that run in the datasets of the page, after a load or a reload (FR-UPL-10): one task-list request per
        // row, and the store tracks the ones that run (no other poll); the rows show them as they are found
        async findImports(rows, signal) {
            try {
                await Promise.all(rows.filter(ds => !ds.isTemporary && ds.permissions?.canRead !== false).map(async ds => {
                    const running = await taskMonitor.findImports(this.org.Dataset(ds.slug));
                    if (running.length && !signal?.aborted) this.refreshImports();
                }));
            } catch (e) {
                // Best effort: the list is there without the tags
                console.warn('Could not look for running imports:', e);
            }
        },

        // Which rows have an import running, and how far it is, from the store
        refreshImports() {
            const progress = {};
            for (const ds of this.datasets) {
                const running = this.org ? taskMonitor.getImports(this.org.Dataset(ds.slug)) : [];
                if (running.length) progress[ds.slug] = Math.round(running[0].progressPercent ?? 0);
            }
            this.importProgress = progress;
        },

        importingText(slug) {
            const percent = this.importProgress[slug];
            return percent > 0 ? `Importing\u2026 ${formatNumber(percent, 0)} %` : 'Importing\u2026';
        },

        // Where the datasets are, asked once for the visit to the organization (a dataset added,
        // removed or renamed asks again); a request in flight is ended when the map is left
        async loadLocations() {
            if (!this.org || this._locationsLoaded) return;
            this._locationsRequest?.abort();
            const request = new AbortController();
            this._locationsRequest = request;
            this.locationsLoading = true;
            try {
                const datasets = await this.org.datasetLocations({ signal: request.signal });
                if (request.signal.aborted) return;
                this.locationGroups = [{ org: this.$route.params.org, orgName: this.orgName, datasets }];
                this._locationsLoaded = true;
            } catch (e) {
                if (request.signal.aborted || e.name === 'AbortError') return;
                this.error = e.message;
            }
            this.locationsLoading = false;
        },

        toRow(ds) {
            return {
                slug: ds.slug,
                creationDate: Date.parse(ds.creationDate),
                lastModified: parseTimestamp(ds.lastModified),
                visibility: ds.properties?.meta?.visibility?.data !== undefined ? ds.properties?.meta?.visibility?.data : Visibility.PRIVATE,
                entries: ds.properties.entries,
                size: ds.size,
                editing: false,
                deleting: false,
                name: ds.properties?.meta?.name?.data,
                tagline: ds.properties?.meta?.tagline?.data || '',
                permissions: ds.permissions,
                hasThumbnail: ds.hasThumbnail === true,
                thumbError: false,
                thumbLoaded: false,
                thumbUrl: '/images/dataset-placeholder.svg'
            };
        },

        // The dialogs refuse a slug in use: they need every slug, not the page
        async loadForbiddenSlugs() {
            try {
                this.forbiddenSlugs = (await this.org.datasets()).map(ds => ds.slug);
            } catch (e) {
                console.warn('Cannot list the dataset slugs:', e);
            }
        },

        // A dataset was added or removed: the page, the total and the locations change
        reloadDatasets() {
            this.invalidateLocations();
            return this.reloadPage();
        },

        // The locations loaded are out of date: the map asks again, now if it is shown
        invalidateLocations() {
            this._locationsLoaded = false;
            if (this.view === 'map') this.loadLocations();
        },

        async reloadPage() {
            try {
                await this.loadPage();
            } catch (e) {
                this.error = e.message;
            }
        },

        preloadDatasetThumbnail(ds) {
            if (!ds.hasThumbnail || ds.thumbLoaded || ds.thumbLoading) return;
            ds.thumbLoading = true;
            const url = this.getDatasetThumbUrl(ds);
            const img = new Image();
            img.onload = () => {
                ds.thumbUrl = url;
                ds.thumbLoaded = true;
                ds.thumbLoading = false;
            };
            img.onerror = () => {
                ds.thumbLoading = false;
            };
            img.src = url;
        },
        getDatasetThumbUrl(ds) {
            const dsobj = this.org.Dataset(ds.slug);
            return dsobj.datasetThumbUrl(150);
        },

        // Organization management
        openOrgDialog() {
            this.orgDialogModel = {
                slug: this.$route.params.org,
                name: this.orgInfo?.name || this.orgName,
                description: this.orgInfo?.description || '',
                isPublic: this.orgInfo?.isPublic || false
            };
            this.orgEditDialogOpen = true;
        },

        handleOrgDialogClose() {
            this.orgEditDialogOpen = false;
            this.orgDialogModel = null;
        },

        // The request of the dialog: a failure is thrown for the dialog to show at its field, and the dialog stays open
        async saveOrganization(neworg) {
            const ret = await reg.orgs.updateOrganization(
                this.$route.params.org,
                neworg.name,
                neworg.description,
                neworg.isPublic
            );
            if (!ret) throw new Error('Failed to update organization');

            this.orgName = neworg.name || this.$route.params.org;
            this.orgInfo = { ...this.orgInfo, name: neworg.name, description: neworg.description, isPublic: neworg.isPublic };
            setTitle(this.orgName);
            this.$notify.success('Organization updated successfully', { summary: 'Organization Updated' });
        },

        openMembersDialog() {
            this.membersDialogOpen = true;
        },

        closeMembersDialog() {
            this.membersDialogOpen = false;
        },

        // The user changed their own permissions in the members dialog: what the page and the
        // dialog offer follows the organization's answer
        async reloadOrgInfo() {
            try {
                this.orgInfo = await this.org.info();
            } catch (e) {
                if (!isUnauthorized(e)) this.$notify.error(e.message);
            }
        }
    }
}
</script>

<style scoped>
#datasets {
    /* The space around the page is its padding, so the column of .page-column keeps it on a narrow screen */
    padding: 0.75rem;
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .ds-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
    }

    .org-header {
        flex-shrink: 0;
        padding: var(--ddb-spacing-md) 0;

        .org-header-layout {
            display: flex;
            align-items: center;
            gap: var(--ddb-spacing-xl);
        }

        .org-identity {
            flex: 1;
            min-width: 0;
        }

        .org-actions {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: var(--ddb-spacing-sm);
        }

        .org-icon-wrapper {
            width: 3rem;
            height: 3rem;
            border-radius: var(--ddb-radius-md);
            background: var(--p-primary-50);
            color: var(--p-primary-color);
            font-size: var(--ddb-font-size-lg);
            flex-shrink: 0;
        }

        .org-title-row {
            display: flex;
            align-items: center;
            gap: var(--ddb-spacing-sm);
            flex-wrap: wrap;
        }

        .org-description {
            color: var(--ddb-text-secondary);
            font-size: var(--ddb-font-size-sm);
        }
    }

    /* Responsive: stack header vertically on small screens */
    @media screen and (max-width: 767.98px) {
        .org-header {
            .org-header-layout {
                flex-direction: column;
                align-items: stretch;
                gap: var(--ddb-spacing-md);
            }

            /* Create takes the room the other actions leave */
            .org-primary-action {
                flex: 1 1 auto;
            }
        }
    }

    /* A phone: the secondary actions as icons (their name stays in aria-label and title), as high as Create */
    @media screen and (max-width: 575.98px) {
        /* The tags are a group on their own line under the title: they wrap together, not one by one */
        .org-header .org-tags {
            flex-basis: 100%;
        }

        .org-header .org-secondary-action {
            align-self: stretch;
        }

        .org-header .org-secondary-action :deep(.p-button-label) {
            display: none;
        }
    }

    /* The rows keep their height, so the paginator is right below the last one; the table shrinks and
       scrolls its rows (scroll-height="flex") only when they are more than the screen holds (FR-ORG-25) */
    .ds-table {
        flex: 0 1 auto;
        /* scroll-height="flex" gives the table the height of its parent: the height of its rows is wanted */
        height: auto;
        min-height: 0;
    }

    /* The columns take the width of their content, so the free width goes to the Dataset column and a row
       reads in one look on a wide screen (FR-ORG-24) */
    .ds-table :deep(.ds-col-date) { width: 11rem; }
    .ds-table :deep(.ds-col-count) { width: 6rem; }
    .ds-table :deep(.ds-col-visibility) { width: 8rem; }

    /* A header never wraps; the columns that do not fit leave the table instead */
    .ds-table :deep(th) {
        white-space: nowrap;
    }

    .ds-pagination {
        flex-shrink: 0;
    }

    .ds-pagination-placeholder {
        visibility: hidden;
    }

    /* The page size select follows the page links */
    .ds-pagination :deep(.p-paginator-content-end) {
        margin-inline-start: 0;
    }

    @media screen and (max-width: 767.98px) {
        .ds-pagination {
            flex-direction: column;
            align-items: center;
            gap: var(--ddb-spacing-sm);

            > span {
                font-size: var(--ddb-font-size-sm);
            }

            :deep(.p-paginator) {
                flex-wrap: wrap;
            }
        }
    }

    @media screen and (max-width: 575.98px) {
        .ds-pagination :deep(.p-paginator-first),
        .ds-pagination :deep(.p-paginator-last) {
            display: none;
        }
    }

    .ds-thumb-img {
        display: block;
        width: 3.5rem;
        height: 2.5rem;
        object-fit: cover;
        border-radius: var(--ddb-radius-sm);
    }

    .ds-thumb-placeholder {
        opacity: 0.35;
    }

    /* Spinner shown in the thumb column of temporary (creating/importing) rows */
    .ds-row-spinner {
        width: 2rem;
        height: 2rem;
    }

    .ds-name {
        font-weight: bold;
        color: inherit;
        text-decoration: none;
        overflow-wrap: anywhere;
    }

    /* The stretched link of the name covers its cell */
    .ds-table :deep(.ds-name-cell) {
        position: relative;
    }

    .ds-name-line {
        display: inline-flex;
        align-items: baseline;
        gap: var(--ddb-spacing-xs);
    }

    .ds-name:hover {
        text-decoration: underline;
    }

    .ds-tagline {
        font-weight: normal;
        color: var(--ddb-text-muted);
        font-size: var(--ddb-font-size-sm);
        margin-top: var(--ddb-spacing-xs);
        max-width: 22rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Visibility tags in table: uniform width */
    .ds-table :deep(.p-tag) {
        min-width: 6.5rem;
        justify-content: center;
    }

    /* Responsive adjustments */
    @media screen and (max-width: 767.98px) {
        :deep(.p-datatable) {
            td, th {
                padding: 0.5rem;
            }
        }
    }

    /* Relative time under absolute date */
    .file-date .relative-time {
        font-size: 0.75rem;
        color: var(--ddb-text-muted);
        display: block;
    }
}
</style>
