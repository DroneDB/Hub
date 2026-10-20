<template>
    <div id="datasets">
        <Message v-model="error" />

        <div v-if="loading" class="ds-content">
            <div class="p-3">
                <Skeleton width="16rem" height="2rem" class="mb-3" />
                <DataTable :value="skeletonRows" striped-rows class="ds-table">
                    <Column header="" style="width: 3.75rem;">
                        <template #body><Skeleton width="2.5rem" height="2.5rem" /></template>
                    </Column>
                    <Column>
                        <template #header><i class="fa-solid fa-database" /> Dataset</template>
                        <template #body><Skeleton width="70%" /><Skeleton width="50%" height="0.75rem" class="mt-1" /></template>
                    </Column>
                    <Column header="Creation Date">
                        <template #body><Skeleton width="6rem" /></template>
                    </Column>
                    <Column header="Files">
                        <template #body><Skeleton width="2rem" /></template>
                    </Column>
                    <Column header="Size">
                        <template #body><Skeleton width="4rem" /></template>
                    </Column>
                    <Column header="Visibility">
                        <template #body><Skeleton width="5rem" height="1.5rem" border-radius="1rem" /></template>
                    </Column>
                </DataTable>
            </div>
        </div>
        <div v-else class="ds-content">
            <!-- Organization header -->
            <div class="org-header">
                <div class="org-header-layout d-flex align-items-center">
                    <!-- Left: identity -->
                    <div class="org-identity">
                        <div class="d-flex align-items-center gap-3">
                            <div class="org-icon-wrapper d-flex align-items-center justify-content-center">
                                <i class="fa-solid fa-sitemap" />
                            </div>
                            <div>
                                <div class="org-title-row">
                                    <h1 class="my-0">{{ orgName }}</h1>
                                    <Button v-if="canManageOrg" severity="secondary" text rounded size="small" title="Edit Organization" icon="fa-solid fa-pencil" @click.stop="openOrgDialog()" />
                                    <div class="org-tags d-flex align-items-center gap-2 flex-wrap">
                                        <Tag v-if="orgInfo?.owner" rounded severity="secondary" icon="fa-solid fa-user">
                                            {{ orgInfo.owner }}
                                        </Tag>
                                        <Tag rounded :severity="orgInfo?.isPublic ? 'success' : 'warn'" :icon="orgInfo?.isPublic ? 'fa-solid fa-globe' : 'fa-solid fa-lock'">
                                            {{ orgInfo?.isPublic ? 'Public' : 'Private' }}
                                        </Tag>
                                        <Tag rounded severity="info" icon="fa-solid fa-database">
                                            {{ totalDatasets }}
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
                    <!-- Right: actions -->
                    <div class="org-actions">
                        <div class="d-flex align-items-center gap-2">
                            <Button v-if="memberManagementEnabled && canManageOrg" severity="secondary" outlined size="small" title="Manage Members" icon="fa-solid fa-users" label="Members" @click.stop="openMembersDialog()" />
                            <Button v-if="canCreateDataset" severity="secondary" outlined size="small" title="Import Dataset" icon="fa-solid fa-download" label="Import Dataset" @click.stop="openImportDialog()" />
                            <Button v-if="canCreateDataset" severity="primary" size="small" icon="fa-solid fa-plus" label="Create Dataset" @click.stop="handleNew()" />
                        </div>
                        <IconField class="mt-2">
                            <InputIcon class="fa-solid fa-magnifying-glass" />
                            <InputText v-model="searchQuery" small placeholder="Search datasets" fluid />
                        </IconField>
                    </div>
                </div>
            </div>

            <!-- Datasets Table -->
            <DataTable :value="datasets" :paginator="false" striped-rows
                       row-hover class="ds-table" scrollable scroll-height="flex"
                       :sort-field="sortColumn" :sort-order="sortOrderPrimevue"
                       :pt="{ bodyRow: { style: 'cursor: pointer' } }" @row-click="onRowClick" @row-contextmenu="onRowContextMenu"
                       @sort="onSort">
                <Column header="" style="width: 3.75rem;">
                    <template #body="slotProps">
                        <ProgressSpinner v-if="slotProps.data.loading" class="ds-row-spinner" stroke-width="4" />
                        <img v-else :src="slotProps.data.thumbUrl" class="ds-thumb-img"
                             :class="{ 'ds-thumb-placeholder': !slotProps.data.thumbLoaded }">
                    </template>
                </Column>
                <Column field="name" :sortable="true">
                    <template #header>
                        <i class="fa-solid fa-database" /> Dataset
                    </template>
                    <template #body="slotProps">
                        <span class="ds-name">{{ slotProps.data.name || slotProps.data.slug }}</span>
                        <div v-if="slotProps.data.tagline" class="ds-tagline">{{ slotProps.data.tagline }}</div>
                    </template>
                </Column>
                <Column field="creationDate" header="Creation Date" :sortable="true"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <div class="file-date">
                            <div>{{ formatDateTime(slotProps.data.creationDate) }}</div>
                            <small class="relative-time">{{ formatCreationDateRel(slotProps.data.creationDate) }}</small>
                        </div>
                    </template>
                </Column>
                <Column field="entries" header="Files" :sortable="true"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }" />
                <Column field="size" header="Size" :sortable="true"
                        :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">{{ bytesToSize(slotProps.data.size) }}</template>
                </Column>
                <Column field="visibility" header="Visibility" :sortable="true" :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <Tag v-if="slotProps.data.visibility === Visibility.PUBLIC" severity="success" icon="fa-solid fa-unlock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                        <Tag v-else-if="slotProps.data.visibility === Visibility.UNLISTED" severity="info" icon="fa-solid fa-unlock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                        <Tag v-else severity="warn" icon="fa-solid fa-lock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                    </template>
                </Column>
                <Column v-if="showActionsColumn" header="Actions" :pt="{ bodyCell: { style: 'text-align: center' }, columnHeaderContent: { style: 'display: flex; justify-content: center' } }" style="width: 7.5rem;">
                    <template #body="slotProps">
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canWrite"
                                severity="secondary" outlined size="small" :loading="slotProps.data.editing"
                                :disabled="slotProps.data.editing || slotProps.data.deleting" icon="fa-solid fa-pencil"
                                @click.stop="handleEdit(slotProps.data)" />
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canDelete && canDeleteGlobal"
                                severity="danger" size="small" :loading="slotProps.data.deleting"
                                :disabled="slotProps.data.deleting || slotProps.data.editing" icon="fa-solid fa-trash"
                                class="ms-1" @click.stop="handleDelete(slotProps.data)" />
                    </template>
                </Column>
                <template #empty>
                    <div class="text-center p-4">
                        <h3>No datasets found</h3>
                        <p v-if="canCreateDataset">You can create a new dataset by clicking the create dataset button.</p>
                    </div>
                </template>
            </DataTable>

            <PrimeContextMenu ref="datasetContextMenu" :model="datasetContextMenuItems" />

            <!-- Pagination -->
            <div v-if="totalPages > 0" class="ds-pagination d-flex justify-content-between align-items-center mt-2 p-2">
                <span>
                    Showing {{ datasets.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0 }} to
                    {{ Math.min(currentPage * itemsPerPage, totalDatasets) }} of {{ totalDatasets }} datasets
                </span>
                <Paginator v-if="totalPages > 1"
                           :rows="Number(itemsPerPage)" :total-records="totalDatasets"
                           :first="(currentPage - 1) * itemsPerPage"
                           :rows-per-page-options="[5, 10, 25, 50, 100]" @page="onPageChange" />
            </div>
        </div>

        <DeleteDatasetDialog v-if="deleteDialogOpen" :ds-slug="currentDsSlug" @close="handleDeleteClose" />
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @close="handleMessageClose" />
        <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbidden-slugs="forbiddenSlugs"
                       @close="handleDatasetClose" />

        <ImportDatasetDialog v-if="importDialogOpen" :org-slug="$route.params.org" :forbidden-slugs="forbiddenSlugs"
                             @close="handleImportClose" />

        <OrganizationDialog v-if="orgEditDialogOpen" mode="edit" :model="orgDialogModel"
                            @close="handleOrgDialogClose" />
        <OrganizationMembersDialog v-if="membersDialogOpen"
                                   :org-slug="$route.params.org"
                                   :can-manage-members="orgInfo?.permissions?.canManageMembers || false"
                                   @close="closeMembersDialog" />

        <!-- Full-screen feedback while a new dataset is being created -->
        <div v-if="creatingDataset" class="ds-overlay-wrapper">
            <Loader />
        </div>

    </div>
</template>

<script>
import Message from '@/components/Message.vue';
import { setTitle, bytesToSize, formatTimeAgo } from '@/libs/utils';
import { renameDataset, datasetName } from '@/libs/api/registryUtils';
import { getDatasetTablePreferences, saveDatasetTablePreferences } from '@/libs/storageUtils';
import DeleteDatasetDialog from './DeleteDatasetDialog.vue';
import DatasetDialog from './DatasetDialog.vue';
import ImportDatasetDialog from './ImportDatasetDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import OrganizationDialog from '@/features/organizations/OrganizationDialog.vue';
import OrganizationMembersDialog from '@/features/organizations/OrganizationMembersDialog.vue';
import Loader from '@/components/Loader.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Paginator from 'primevue/paginator';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import PrimeContextMenu from 'primevue/contextmenu';
import reg from '@/libs/api/sharedRegistry';
import { datasetListQuery } from '@/libs/datasetList';

// Typing in the search box asks the server once the user pauses
const SEARCH_DELAY_MS = 300;
import { Features } from '@/libs/features';
import { Visibility } from 'ddb';
import { formatDateTime } from '@/libs/format';
import { isUnauthorized } from '@/libs/ddb/apiError';

export default {
    name: 'DatasetsPage',
    components: {
        Message,
        DeleteDatasetDialog,
        MessageDialog,
        DatasetDialog,
        ImportDatasetDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Loader,
        Button,
        DataTable,
        Column,
        InputText,
        IconField,
        InputIcon,
        Paginator,
        Tag,
        
        ProgressSpinner,
        Skeleton,
        PrimeContextMenu
    },
    data: function () {
        // Load preferences from Local Storage
        const prefs = getDatasetTablePreferences();

        return {
            Visibility,
            skeletonRows: new Array(10).fill({}),
            error: "",
            // The page shown (the server searches, sorts and pages, HUB-07)
            datasets: [],
            totalDatasets: 0,
            // Every slug of the organization, for the create/rename/import dialogs (loaded when
            // one opens)
            forbiddenSlugs: [],
            loading: true,
            deleteDialogOpen: false,
            currentDsSlug: null,
            messageDialogOpen: false,
            currentMessage: null,

            dsDialogModel: null,
            dsDialogMode: null,
            dsDialogOpen: false,

            importDialogOpen: false,

            // Blocking overlay flag while a new dataset is being created (Loader.vue)
            creatingDataset: false,

            orgEditDialogOpen: false,
            orgDialogModel: null,
            membersDialogOpen: false,

            contextMenuDataset: null,

            orgName: "",
            orgInfo: null,

            // Sorting - use saved preferences or defaults
            sortColumn: prefs?.sortColumn || "name",
            sortDirection: prefs?.sortDirection || "asc",

            // Pagination - use saved preferences or defaults
            currentPage: 1,
            itemsPerPage: prefs?.itemsPerPage || 10,

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
        // Check if user can create datasets in this organization
        // User can create if: dataset creation is not disabled AND at least one dataset has canWrite permission
        // OR if there are no datasets yet (server will validate permission)
        canCreateDataset: function () {
            if (HubOptions.disableDatasetCreation) return false;
            // If user has write permission on the org, they can create datasets
            if (this.orgInfo?.permissions?.canWrite) return true;
            if (this.datasets.length === 0) return true;
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
        // What the server is asked for: changes to any of it load that page
        listQuery: function () {
            return datasetListQuery({
                page: this.currentPage, pageSize: this.itemsPerPage, search: this.searchTerm,
                sortColumn: this.sortColumn, sortDirection: this.sortDirection
            });
        },
        totalPages: function () {
            return Math.ceil(this.totalDatasets / this.itemsPerPage);
        }, displayedPages: function () {
            if (this.totalPages <= 5) {
                // If we have 5 or fewer pages, show all pages
                return Array.from({ length: this.totalPages }, (_, i) => i + 1);
            }

            const pages = [];
            const range = 1; // Number of pages to show before and after current page

            // Always include first page
            pages.push(1);

            // Add ellipsis after first page if needed
            if (this.currentPage > 2 + range) {
                pages.push('ellipsis-1');
            }

            // Add pages around current page
            const startPage = Math.max(2, this.currentPage - range);
            const endPage = Math.min(this.totalPages - 1, this.currentPage + range);

            for (let i = startPage; i <= endPage; i++) {
                pages.push(i);
            }

            // Add ellipsis before last page if needed
            if (this.currentPage < this.totalPages - 1 - range) {
                pages.push('ellipsis-2');
            }

            // Always include last page if we have more than one page
            if (this.totalPages > 1) {
                pages.push(this.totalPages);
            }

            return pages;
        },
        sortOrderPrimevue: function () {
            return this.sortDirection === 'asc' ? 1 : -1;
        }
    },
    watch: {
        listQuery: function () {
            this.reloadPage();
        },
        searchQuery: function (value) {
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this.currentPage = 1;
                this.searchTerm = value;
            }, SEARCH_DELAY_MS);
        },
        itemsPerPage: function () {
            this.currentPage = 1; // Reset to first page when items per page changes
            this.savePreferences();
        },
        sortColumn: function () {
            this.currentPage = 1;
            this.savePreferences();
        },
        sortDirection: function () {
            this.currentPage = 1;
            this.savePreferences();
        }
    },
    mounted: async function () {
        try {
            this.org = reg.Organization(this.$route.params.org);
            const orgInfo = await this.org.info();
            this.orgName = orgInfo.name !== "" ? orgInfo.name : this.$route.params.org;
            this.orgInfo = orgInfo;
            setTitle(this.orgName);

            await this.loadPage();
        } catch (e) {
            if (isUnauthorized(e)) {
                // reg.onUnauthorized sends the user to Login
            } else if (e.status === 404) {
                this.$router.push({ name: "Organizations" }).catch(() => { });
            } else {
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    beforeUnmount() {
        clearTimeout(this._searchTimer);
        this._listRequest?.abort();
    }, methods: {
        /**
         * Save table preferences to Local Storage
         */
        savePreferences: function () {
            saveDatasetTablePreferences(this.sortColumn, this.sortDirection, this.itemsPerPage);
        },
        bytesToSize,
        datasetName,

        formatDateTime,

        formatCreationDateRel(timestamp) {
            if (!timestamp) return '';
            return formatTimeAgo(timestamp);
        },

        getVisibilityText(visibility) {
            if (visibility === Visibility.PUBLIC) return 'Public';
            if (visibility === Visibility.UNLISTED) return 'Unlisted';
            return 'Private';
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

        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
            }
        },

        handleDelete(ds) {
            this.currentDsSlug = ds.slug;
            this.deleteDialogOpen = true;
        }, async handleDeleteClose(res) {
            this.deleteDialogOpen = false;

            if (res == "close") {
                this.currentDsSlug = null;
                return;
            }

            let ds = this.datasets.find(o => o.slug == this.currentDsSlug);
            ds['deleting'] = true;

            try {
                let ret = await this.org.Dataset(this.currentDsSlug).delete()

                if (ret) {
                    // The next dataset moves into the page
                    await this.reloadPage();
                    this.$notify.success('Dataset deleted successfully', { summary: 'Dataset Deleted' });
                } else {
                    this.$notify.error('Failed to delete dataset "' + this.currentDsSlug + '"');
                    console.error(ret);
                    ds['deleting'] = false;
                }
            } catch (e) {
                console.error(e);
                this.$notify.error('Failed to delete dataset: ' + e.message);
                ds['deleting'] = false;
            }
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
                // Keep the dialog open and show the new dataset as importing.
                this.addImportingEntry(payload);
                return;
            }

            this.importDialogOpen = false;

            if (action === 'done') {
                const index = this.datasets.findIndex(ds => ds.isTemporary && ds.slug === slug);
                if (payload.success) {
                    this.reloadPage();
                    this.$notify.success(`Dataset "${slug}" imported successfully`, { summary: 'Import complete', life: 'normal' });
                } else {
                    if (index !== -1) {
                        this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === slug));
                    }
                    this.$notify.error((payload && payload.error) || `Import of "${slug}" failed`, { summary: 'Import failed', life: 'long' });
                }
            } else if (action === 'background') {
                this.$notify.info(`Import of "${slug}" continues in the background`, { summary: 'Import running', life: 'normal' });
            }
        },

        async handleDatasetClose(res, newds) {
            // Ignore stray duplicate closes (e.g. double Enter on the name field)
            if (this.creatingDataset) return;

            this.dsDialogOpen = false;

            if (res == "close") {
                this.dsDialogModel = null;
                return;
            }

            if (this.dsDialogMode == "new") {
                this.dsDialogModel = null;
                this.creatingDataset = true;

                try {
                    // Set loading state for the UI
                    const loadingIndicator = { loading: true, isTemporary: true };
                    this.datasets.unshift({
                        slug: newds.slug,
                        creationDate: Date.now(),
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
                        ...loadingIndicator
                    });

                    let ret = await this.org.createDataset(newds.slug, newds.name, newds.visibility, newds.tagline);
                    if (ret) {
                        // The server places the new dataset in the sort order
                        await this.reloadPage();

                        this.$notify.success('Dataset created successfully', { summary: 'Dataset Created' });

                        // Navigate to the newly created dataset if the user has enabled the preference
                        if (newds.openAfterCreate) {
                            this.$router.push({
                                name: "ViewDataset",
                                params: {
                                    org: this.$route.params.org,
                                    ds: newds.slug
                                }
                            });
                        }
                    } else {
                        // Remove the temporary dataset on error
                        this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                        this.$notify.error('Failed to create dataset "' + newds.slug + '"');
                        console.error(ret);
                    }
                } catch (e) {
                    // Remove the temporary dataset on error
                    this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                    console.error(e);
                    this.$notify.error('Failed to create dataset: ' + e.message);
                } finally {
                    this.creatingDataset = false;
                }

            } else if (this.dsDialogMode == "edit") {
                let ds = this.dsDialogModel;
                this.dsDialogModel = null;

                let dsitem = this.datasets.find(o => o.slug == ds.slug);
                dsitem['editing'] = true;

                try {
                    // Use renameDataset function to update name and slug
                    let ret = await renameDataset(this.$route.params.org, ds.slug, newds.name);

                    if (ret) {
                        // Also update visibility if needed
                        let dsobj = this.org.Dataset(ret.slug);
                        let update = await dsobj.update(newds.name, newds.visibility);

                        // Handle tagline update
                        if (newds.tagline) {
                            await dsobj.metaSet('tagline', newds.tagline);
                        } else {
                            await dsobj.metaUnset('tagline');
                        }

                        if (update) {
                            // Update the object in the local dataset
                            dsitem['slug'] = ret.slug;
                            dsitem['name'] = newds.name;
                            dsitem['visibility'] = newds.visibility;
                            dsitem['tagline'] = newds.tagline || '';
                            this.$notify.success('Dataset updated successfully', { summary: 'Dataset Updated' });
                        }
                    } else {
                        this.$notify.error(`Failed to update dataset "${ds.slug}"`);
                    }
                } catch (e) {
                    console.error(e);
                    this.$notify.error('Failed to update dataset: ' + e.message);
                }

                dsitem['editing'] = false;
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
            this.viewDataset(event.data);
        },

        onRowContextMenu(event) {
            this.contextMenuDataset = event.data;
            this.$refs.datasetContextMenu.show(event.originalEvent);
        },

        onPageChange(event) {
            this.currentPage = event.page + 1;
            this.itemsPerPage = event.rows;
        },

        upload: function () {
            this.$router.push({ name: "Upload" });
        },

        // One server page with the covers checked for its rows only (HUB-07); a newer request
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
            } catch (e) {
                if (e.name === 'AbortError') return;
                throw e;
            }
        },

        toRow(ds) {
            return {
                slug: ds.slug,
                creationDate: Date.parse(ds.creationDate),
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

        // A dataset was added or removed: the page and the total change
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

        async handleOrgDialogClose(res, neworg) {
            this.orgEditDialogOpen = false;

            if (res === 'close' || !neworg) {
                this.orgDialogModel = null;
                return;
            }

            try {
                const ret = await reg.orgs.updateOrganization(
                    this.$route.params.org,
                    neworg.name,
                    neworg.description,
                    neworg.isPublic
                );
                if (ret) {
                    this.orgName = neworg.name || this.$route.params.org;
                    this.orgInfo = { ...this.orgInfo, name: neworg.name, description: neworg.description, isPublic: neworg.isPublic };
                    setTitle(this.orgName);
                    this.$notify.success('Organization updated successfully', { summary: 'Organization Updated' });
                } else {
                    this.error = 'Failed to update organization';
                }
            } catch (e) {
                console.error(e);
                this.error = 'Failed to update organization: ' + e.message;
            }
            this.orgDialogModel = null;
        },

        openMembersDialog() {
            this.membersDialogOpen = true;
        },

        closeMembersDialog() {
            this.membersDialogOpen = false;
        }
    }
}
</script>

<style scoped>
#datasets {
    margin: 0.75rem;
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
            align-items: flex-start;
            gap: var(--ddb-spacing-xl);
        }

        .org-identity {
            flex: 1;
            min-width: 0;
        }

        .org-actions {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
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

        h1 {
            font-size: 1.75rem;
            line-height: 1.2;
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
                gap: var(--ddb-spacing-md);
            }

            .org-actions {
                align-items: stretch;
                width: 100%;

                > .d-flex {
                    justify-content: stretch;
                }
            }

            h1 {
                font-size: var(--ddb-font-size-lg);
            }
        }
    }

    .ds-table {
        flex: 1;
        min-height: 0;
    }

    .ds-pagination {
        flex-shrink: 0;
    }

    @media screen and (max-width: 767.98px) {
        .ds-pagination {
            flex-direction: column;
            align-items: center;
            gap: var(--ddb-spacing-sm);

            > span {
                font-size: var(--ddb-font-size-sm);
            }
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

    /* Loader.vue is position:absolute, so pin it to the viewport via this wrapper */
    .ds-overlay-wrapper {
        position: fixed;
        inset: 0;
        z-index: 1000;
    }

    .ds-name {
        font-weight: bold;
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
