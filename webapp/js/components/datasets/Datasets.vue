<template>
    <div id="datasets">
        <Toast position="bottom-left" />
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <ProgressSpinner style="width: 3rem; height: 3rem" />
        </div>
        <div v-else>
            <Toolbar class="top-toolbar">
                <template #start>
                    <div class="org-heading d-flex align-items-center gap-3">
                        <i class="fa-solid fa-sitemap org-icon"></i>
                        <div>
                            <div class="d-flex align-items-center gap-2">
                                <h1 class="mb-0">{{ orgName }}</h1>
                                <Button v-if="canManageOrg" @click.stop="openOrgDialog()" severity="secondary" text size="small" title="Edit Organization">
                                    <i class="fa-solid fa-pencil"></i>
                                </Button>
                                <Tag severity="secondary">{{ filteredDatasets.length }} dataset{{ filteredDatasets.length !== 1 ? 's' : '' }}</Tag>
                            </div>
                            <div v-if="orgInfo?.description" class="text-muted small mt-1">{{ orgInfo.description }}</div>
                        </div>
                    </div>
                </template>
                <template #end>
                    <div class="d-flex align-items-center gap-2">
                        <IconField>
                            <InputIcon class="fa-solid fa-magnifying-glass" />
                            <InputText v-model="searchQuery" placeholder="Search datasets..." style="min-width: 14rem" />
                        </IconField>
                        <Button v-if="memberManagementEnabled && canManageOrg" @click.stop="openMembersDialog()" severity="secondary" text size="small" title="Manage Members">
                            <i class="fa-solid fa-users"></i> <span class="ms-1">Members</span>
                        </Button>
                        <Button v-if="canCreateDataset" @click.stop="handleNew()" severity="primary" size="small">
                            <i class="fa-solid fa-plus"></i>&nbsp;Create Dataset
                        </Button>
                    </div>
                </template>
            </Toolbar>

            <!-- Datasets Table -->
            <DataTable :value="paginatedDatasets" :paginator="false" stripedRows
                @row-click="onRowClick" rowHover class="ds-table"
                :pt="{ bodyRow: { style: 'cursor: pointer' } }">
                <Column header="" style="width: 3.75rem;">
                    <template #body="slotProps">
                        <img :src="slotProps.data.thumbUrl" class="ds-thumb-img"
                            :class="{ 'ds-thumb-placeholder': !slotProps.data.thumbLoaded }" />
                    </template>
                </Column>
                <Column field="name" :sortable="true">
                    <template #header>
                        <i class="fa-solid fa-database"></i> Dataset
                    </template>
                    <template #body="slotProps">
                        <span class="ds-name">{{ slotProps.data.name || slotProps.data.slug }}</span>
                        <div v-if="slotProps.data.tagline" class="ds-tagline">{{ slotProps.data.tagline }}</div>
                    </template>
                </Column>
                <Column field="creationDate" header="Creation Date" :sortable="true"
                    :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">{{ formatDate(slotProps.data.creationDate) }}</template>
                </Column>
                <Column field="entries" header="Files" :sortable="true"
                    :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }" />
                <Column field="size" header="Size" :sortable="true"
                    :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">{{ bytesToSize(slotProps.data.size) }}</template>
                </Column>
                <Column field="visibility" header="Visibility" :sortable="true" :pt="{ bodyCell: { style: 'text-align: right' }, columnHeaderContent: { style: 'display: flex; justify-content: flex-end' } }">
                    <template #body="slotProps">
                        <Tag v-if="slotProps.data.visibility === 2" severity="success" icon="fa-solid fa-unlock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                        <Tag v-else-if="slotProps.data.visibility === 1" severity="info" icon="fa-solid fa-unlock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                        <Tag v-else severity="warn" icon="fa-solid fa-lock">{{ getVisibilityText(slotProps.data.visibility) }}</Tag>
                    </template>
                </Column>
                <Column v-if="showActionsColumn" header="Actions" :pt="{ bodyCell: { style: 'text-align: center' }, columnHeaderContent: { style: 'display: flex; justify-content: center' } }" style="width: 7.5rem;">
                    <template #body="slotProps">
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canWrite"
                            @click.stop="handleEdit(slotProps.data)" severity="secondary" outlined size="small"
                            :loading="slotProps.data.editing" :disabled="slotProps.data.editing || slotProps.data.deleting"
                            icon="fa-solid fa-pencil" />
                        <Button v-if="slotProps.data.permissions && slotProps.data.permissions.canDelete && canDeleteGlobal"
                            @click.stop="handleDelete(slotProps.data)" severity="danger" size="small"
                            :loading="slotProps.data.deleting" :disabled="slotProps.data.deleting || slotProps.data.editing"
                            icon="fa-solid fa-trash" class="ms-1" />
                    </template>
                </Column>
                <template #empty>
                    <div class="text-center p-4">
                        <h3>No datasets found</h3>
                        <p v-if="canCreateDataset">You can create a new dataset by clicking the create dataset button.</p>
                    </div>
                </template>
            </DataTable>

            <!-- Pagination -->
            <div v-if="totalPages > 0" class="d-flex justify-content-between align-items-center mt-2 p-2">
                <span>
                    Showing {{ paginatedDatasets.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0 }} to
                    {{ Math.min(currentPage * itemsPerPage, filteredDatasets.length) }} of {{ filteredDatasets.length }} datasets
                </span>
                <Paginator v-if="totalPages > 1"
                    :rows="Number(itemsPerPage)" :totalRecords="filteredDatasets.length"
                    :first="(currentPage - 1) * itemsPerPage"
                    @page="onPageChange" :rowsPerPageOptions="[5, 10, 25, 50, 100]" />
            </div>
        </div>

        <DeleteDatasetDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :dsSlug="currentDsSlug">
        </DeleteDatasetDialog>
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
        <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbiddenSlugs="forbiddenSlugs"
            @onClose="handleDatasetClose"></DatasetDialog>

        <OrganizationDialog v-if="orgEditDialogOpen" mode="edit" :model="orgDialogModel"
            @onClose="handleOrgDialogClose"></OrganizationDialog>
        <OrganizationMembersDialog v-if="membersDialogOpen"
            :orgSlug="$route.params.org"
            :canManageMembers="orgInfo?.permissions?.canManageMembers || false"
            @onClose="closeMembersDialog">
        </OrganizationMembersDialog>

    </div>
</template>

<script>
import Message from '../Message.vue';
import { setTitle, bytesToSize } from '../../libs/utils';
import { renameDataset, datasetName } from '../../libs/registryUtils';
import { getDatasetTablePreferences, saveDatasetTablePreferences } from '../../libs/storageUtils';
import DeleteDatasetDialog from './DeleteDatasetDialog.vue';
import DatasetDialog from './DatasetDialog.vue';
import MessageDialog from '../common/MessageDialog.vue';
import OrganizationDialog from '../organizations/OrganizationDialog.vue';
import OrganizationMembersDialog from '../organizations/OrganizationMembersDialog.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import Paginator from 'primevue/paginator';
import Tag from 'primevue/tag';
import Toolbar from 'primevue/toolbar';
import ProgressSpinner from 'primevue/progressspinner';
import Toast from 'primevue/toast';
import Badge from 'primevue/badge';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';

export default {
    components: {
        Message,
        DeleteDatasetDialog,
        MessageDialog,
        DatasetDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Button,
        DataTable,
        Column,
        InputText,
        IconField,
        InputIcon,
        Paginator,
        Tag,
        Toolbar,
        ProgressSpinner,
        Toast,
        Badge
    },
    data: function () {
        // Load preferences from Local Storage
        const prefs = getDatasetTablePreferences();

        return {
            error: "",
            datasets: [],
            loading: true,
            deleteDialogOpen: false,
            currentDsSlug: null,
            messageDialogOpen: false,
            currentMessage: null,

            dsDialogModel: null,
            dsDialogMode: null,
            dsDialogOpen: false,

            orgEditDialogOpen: false,
            orgDialogModel: null,
            membersDialogOpen: false,

            orgName: "",
            orgInfo: null,

            // Sorting - use saved preferences or defaults
            sortColumn: prefs?.sortColumn || "name",
            sortDirection: prefs?.sortDirection || "asc",

            // Pagination - use saved preferences or defaults
            currentPage: 1,
            itemsPerPage: prefs?.itemsPerPage || 10,

            // Filtering
            searchQuery: ""
        }
    },
    mounted: async function () {
        try {
            this.org = reg.Organization(this.$route.params.org);
            const orgInfo = await this.org.info();
            this.orgName = orgInfo.name !== "" ? orgInfo.name : this.$route.params.org;
            this.orgInfo = orgInfo;
            setTitle(this.orgName);

            const tmp = await this.org.datasets(); this.datasets = tmp.map(ds => {
                return {
                    slug: ds.slug,
                    creationDate: Date.parse(ds.creationDate),
                    visibility: ds.properties?.meta?.visibility?.data !== undefined ? ds.properties?.meta?.visibility?.data : 0,
                    entries: ds.properties.entries,
                    size: ds.size,
                    editing: false,
                    deleting: false,
                    name: ds.properties?.meta?.name?.data,
                    tagline: ds.properties?.meta?.tagline?.data || '',
                    permissions: ds.permissions,
                    thumbError: false,
                    thumbLoaded: false,
                    thumbUrl: '/images/dataset-placeholder.svg'
                };
            });

            this.preloadThumbnails();

        } catch (e) {
            if (e.status === 401) {
                this.$router.push({ name: "Login" }).catch(() => { });
            } else if (e.status === 404) {
                this.$router.push({ name: "Organizations" }).catch(() => { });
            } else {
                this.error = e.message;
            }
        }
        this.loading = false;
    },
    computed: {
        forbiddenSlugs: function () {
            return this.datasets.map(ds => ds.slug);
        },
        canDeleteGlobal: function () {
            return !HubOptions.disableDatasetCreation;
        },
        canManageOrg: function () {
            return this.orgInfo?.permissions?.canManageMembers || false;
        },
        memberManagementEnabled: function () {
            return reg.getFeature(Features.ORGANIZATION_MEMBER_MANAGEMENT);
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
        // Filtering
        filteredDatasets: function () {
            let filtered = this.datasets;

            // Filter by search query
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(ds => {
                    const name = (ds.name || ds.slug).toLowerCase();
                    const slug = ds.slug.toLowerCase();
                    const tagline = (ds.tagline || '').toLowerCase();
                    return name.includes(query) || slug.includes(query) || tagline.includes(query);
                });
            }

            // Apply sorting
            const sortMultiplier = this.sortDirection === 'asc' ? 1 : -1;
            filtered.sort((a, b) => {
                if (this.sortColumn === 'name') {
                    const aName = a.name || a.slug;
                    const bName = b.name || b.slug;
                    return aName.localeCompare(bName) * sortMultiplier;
                } else if (this.sortColumn === 'creationDate' || this.sortColumn === 'size' || this.sortColumn === 'entries' || this.sortColumn === 'visibility') {
                    return (a[this.sortColumn] - b[this.sortColumn]) * sortMultiplier;
                } else {
                    return a[this.sortColumn].localeCompare(b[this.sortColumn]) * sortMultiplier;
                }
            });

            return filtered;
        },
        // Pagination
        paginatedDatasets: function () {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return this.filteredDatasets.slice(start, end);
        },
        totalPages: function () {
            return Math.ceil(this.filteredDatasets.length / this.itemsPerPage);
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
        }
    },
    watch: {
        itemsPerPage: function (newValue) {
            this.currentPage = 1; // Reset to first page when items per page changes
            this.savePreferences();
        },
        sortColumn: function () {
            this.savePreferences();
        },
        sortDirection: function () {
            this.savePreferences();
        }
    }, methods: {
        /**
         * Save table preferences to Local Storage
         */
        savePreferences: function () {
            saveDatasetTablePreferences(this.sortColumn, this.sortDirection, this.itemsPerPage);
        },
        bytesToSize,
        datasetName,

        formatDate(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },

        getVisibilityText(visibility) {
            if (visibility === 2) return 'Public';
            if (visibility === 1) return 'Unlisted';
            return 'Private';
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
                    // Find the index of the dataset to remove
                    const index = this.datasets.findIndex(o => o.slug === this.currentDsSlug);
                    if (index !== -1) {
                        // Only remove the specific dataset instead of recreating the entire array
                        this.datasets.splice(index, 1);
                    }
                    this.$toast.add({ severity: 'success', summary: 'Dataset Deleted', detail: 'Dataset deleted successfully', life: 3000 });
                } else {
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete dataset "' + this.currentDsSlug + '"', life: 5000 });
                    console.error(ret);
                    ds['deleting'] = false;
                }
            } catch (e) {
                console.error(e);
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete dataset: ' + e.message, life: 5000 });
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
                visibility: ds.visibility !== undefined ? ds.visibility : 0,
                tagline: ds.tagline || ''
            };
            this.dsDialogMode = "edit";
            this.dsDialogOpen = true;
        },

        newDataset() {
            this.dsDialogMode = "new";
            this.dsDialogOpen = true;
        },

        handleNew() {
            this.newDataset();
        }, async handleDatasetClose(res, newds) {
            this.dsDialogOpen = false;

            if (res == "close") {
                this.dsDialogModel = null;
                return;
            }

            if (this.dsDialogMode == "new") {
                this.dsDialogModel = null;

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
                        // Find and update the temporary dataset
                        const index = this.datasets.findIndex(ds => ds.isTemporary && ds.slug === newds.slug);
                        if (index !== -1) {
                            // Replace the temporary entry with final data
                            this.datasets[index] = {
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
                                thumbUrl: '/images/dataset-placeholder.svg'
                            };
                            this.preloadDatasetThumbnail(this.datasets[index]);
                        }

                        this.$toast.add({ severity: 'success', summary: 'Dataset Created', detail: 'Dataset created successfully', life: 3000 });

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
                        this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create dataset "' + newds.slug + '"', life: 5000 });
                        console.error(ret);
                    }
                } catch (e) {
                    // Remove the temporary dataset on error
                    this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                    console.error(e);
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create dataset: ' + e.message, life: 5000 });
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
                            this.$toast.add({ severity: 'success', summary: 'Dataset Updated', detail: 'Dataset updated successfully', life: 3000 });
                        }
                    } else {
                        this.$toast.add({ severity: 'error', summary: 'Error', detail: `Failed to update dataset "${ds.slug}"`, life: 5000 });
                    }
                } catch (e) {
                    console.error(e);
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update dataset: ' + e.message, life: 5000 });
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

        onPageChange(event) {
            this.currentPage = event.page + 1;
            this.itemsPerPage = event.rows;
        },

        upload: function () {
            this.$router.push({ name: "Upload" });
        },

        preloadThumbnails() {
            this.datasets.forEach(ds => this.preloadDatasetThumbnail(ds));
        },
        preloadDatasetThumbnail(ds) {
            const url = this.getDatasetThumbUrl(ds);
            const img = new Image();
            img.onload = () => {
                ds.thumbUrl = url;
                ds.thumbLoaded = true;
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
                const ret = await reg.updateOrganization(
                    this.$route.params.org,
                    neworg.name,
                    neworg.description,
                    neworg.isPublic
                );
                if (ret) {
                    this.orgName = neworg.name || this.$route.params.org;
                    this.orgInfo = { ...this.orgInfo, name: neworg.name, description: neworg.description, isPublic: neworg.isPublic };
                    setTitle(this.orgName);
                    this.$toast.add({ severity: 'success', summary: 'Organization Updated', detail: 'Organization updated successfully', life: 3000 });
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
    overflow-y: auto;

    .top-toolbar {
        margin-bottom: 1.5rem;
        border: none;
        background: transparent;
        padding: 0.75rem 0;
    }

    .org-heading {
        .org-icon {
            font-size: var(--ddb-font-size-lg);
            color: var(--ddb-text-secondary);
        }

        h1 {
            font-size: 1.75rem;
            line-height: 1.2;
        }
    }

    .filter-controls {
        margin-bottom: 1.25rem;
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

    /* Visibility tags: uniform width */
    :deep(.p-tag) {
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
}
</style>
