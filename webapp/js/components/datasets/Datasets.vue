<template>
    <div id="datasets">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div v-else>
            <div class="top-banner ui equal width grid middle aligned">
                <div class="column">
                    <h1>{{ orgName }}</h1>
                </div>
                <div class="column right aligned">
                    <button @click.stop="handleNew()" class="ui primary button icon"><i
                            class="ui icon add"></i>&nbsp;Create Dataset</button>
                </div>
            </div>

            <!-- Dataset Controls -->
            <div class="">
                <div class="ui stackable grid">
                    <div class="six wide column">
                        <div class="ui icon input fluid">
                            <input v-model="searchQuery" type="text" placeholder="Search datasets...">
                            <i class="search icon"></i>
                        </div>
                    </div>
                    <div class="four wide column">
                        <div class="ui selection dropdown" ref="visibilityFilter">
                            <input type="hidden" name="visibility" v-model="visibilityFilter">
                            <i class="dropdown icon"></i>
                            <div class="default text">All Visibilities</div>
                            <div class="menu">
                                <div class="item" data-value="all"><i class="filter icon"></i>All</div>
                                <div class="item" data-value="0"><i class="lock icon"></i>Private</div>
                                <div class="item" data-value="1"><i class="unlock icon"></i>Unlisted</div>
                                <div class="item" data-value="2"><i class="unlock icon"></i>Public</div>
                            </div>
                        </div>
                    </div>
                    <div class="six wide column">
                    </div>
                </div>
            </div>

            <!-- Datasets Table -->
            <table class="ui selectable sortable celled table">
                <thead>
                    <tr>
                        <th @click="sortBy('name')">
                            <i class="database icon"></i> Dataset
                            <i v-if="sortColumn === 'name'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('creationDate')">
                            Creation Date
                            <i v-if="sortColumn === 'creationDate'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('entries')">
                            Files
                            <i v-if="sortColumn === 'entries'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('size')">
                            Size
                            <i v-if="sortColumn === 'size'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th @click="sortBy('visibility')">
                            Visibility
                            <i v-if="sortColumn === 'visibility'"
                                :class="sortDirection === 'asc' ? 'caret up icon' : 'caret down icon'"></i>
                        </th>
                        <th class="center aligned">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="ds in paginatedDatasets" :key="ds.slug" @click="viewDataset(ds)" class="clickable-row">
                        <td class="ds-name">{{ ds.slug }}</td>
                        <td>{{ formatDate(ds.creationDate) }}</td>
                        <td>{{ ds.entries }}</td>
                        <td>{{ bytesToSize(ds.size) }}</td>
                        <td>
                            <div v-if="ds.visibility === 2"><i class="unlock icon"></i>{{
                                getVisibilityText(ds.visibility) }}</div>
                            <div v-else-if="ds.visibility === 1"><i class="unlock icon"></i>{{
                                getVisibilityText(ds.visibility) }}</div>
                            <div v-else><i class="lock icon"></i>{{ getVisibilityText(ds.visibility) }}</div>
                        </td>
                        <td class="center aligned">
                            <button @click.stop="handleEdit(ds)" class="ui button icon small grey"
                                :class="{ loading: ds.editing }" :disabled="ds.editing || ds.deleting">
                                <i class="ui icon pencil"></i>
                            </button>
                            <button v-if="canDelete" @click.stop="handleDelete(ds)"
                                class="ui button icon small negative" :class="{ loading: ds.deleting }"
                                :disabled="ds.deleting || ds.editing">
                                <i class="ui icon trash"></i>
                            </button>
                        </td>
                    </tr>
                    <tr v-if="paginatedDatasets.length === 0">
                        <td colspan="6" class="center aligned">
                            <h3>No datasets found</h3>
                            <p>You can create a new dataset by clicking the create dataset button.</p>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="6">
                            <div class="ui grid three column">
                                <div class="column left aligned middle aligned">
                                    <div class="ui left floated">
                                        Showing {{ paginatedDatasets.length > 0 ? (currentPage - 1) * itemsPerPage + 1 :
                                        0 }} to
                                        {{ Math.min(currentPage * itemsPerPage, filteredDatasets.length) }} of {{
                                        filteredDatasets.length }} datasets
                                    </div>
                                </div>
                                <div class="column center aligned middle aligned">
                                    <div v-if="totalPages > 1" class="ui pagination menu">
                                        <a class="item" @click="changePage(1)" :class="{ disabled: currentPage === 1 }">
                                            <i class="angle double left icon"></i>
                                        </a> <a class="item" @click="changePage(currentPage - 1)"
                                            :class="{ disabled: currentPage === 1 }">
                                            <i class="angle left icon"></i>
                                        </a> <a v-for="(page, index) in displayedPages" :key="'page-' + index"
                                            class="item"
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

        <DeleteDatasetDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :dsSlug="currentDsSlug">
        </DeleteDatasetDialog>
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
        <DatasetDialog v-if="dsDialogOpen" :mode="dsDialogMode" :model="dsDialogModel" :forbiddenSlugs="forbiddenSlugs"
            @onClose="handleDatasetClose"></DatasetDialog>

    </div>
</template>

<script>
import Message from '../Message.vue';
import ddb from 'ddb';
import { setTitle, bytesToSize } from '../../libs/utils';
import { renameDataset, datasetName } from '../../libs/registryUtils';
import DeleteDatasetDialog from './DeleteDatasetDialog.vue';
import DatasetDialog from './DatasetDialog.vue';
import MessageDialog from '../common/MessageDialog.vue'

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message,
        DeleteDatasetDialog,
        MessageDialog,
        DatasetDialog
    },
    data: function () {
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

            orgName: "",

            // Sorting
            sortColumn: "name",
            sortDirection: "asc",

            // Pagination
            currentPage: 1,
            itemsPerPage: 10,

            // Filtering
            searchQuery: "",
            visibilityFilter: "all"
        }
    },
    mounted: async function () {
        try {
            this.org = reg.Organization(this.$route.params.org);
            const orgInfo = await this.org.info();
            this.orgName = orgInfo.name !== "" ? orgInfo.name : this.$route.params.org;
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
                    name: ds.properties?.meta?.name?.data
                };
            });            // Initialize dropdown for visibility filter
            this.$nextTick(() => {
                if (this.$refs.visibilityFilter) {
                    $(this.$refs.visibilityFilter).dropdown({
                        onChange: (value) => {
                            this.visibilityFilter = value;
                            this.currentPage = 1; // Reset to first page when filter changes
                        }
                    });

                    // Set the dropdown value after initialization
                    $(this.$refs.visibilityFilter).dropdown('set selected', this.visibilityFilter);
                }
            });

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
        canDelete: function () {
            return !HubOptions.disableDatasetCreation;
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
                    return name.includes(query) || slug.includes(query);
                });
            }

            // Filter by visibility
            if (this.visibilityFilter !== "all") {
                const visibilityValue = parseInt(this.visibilityFilter);
                filtered = filtered.filter(ds => ds.visibility === visibilityValue);
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
        itemsPerPage: function () {
            this.currentPage = 1; // Reset to first page when items per page changes
        }
    }, methods: {
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
            this.$set(ds, 'deleting', true);

            try {
                let ret = await this.org.Dataset(this.currentDsSlug).delete()

                if (ret) {
                    // Find the index of the dataset to remove
                    const index = this.datasets.findIndex(o => o.slug === this.currentDsSlug);
                    if (index !== -1) {
                        // Only remove the specific dataset instead of recreating the entire array
                        this.datasets.splice(index, 1);
                    }
                } else {
                    this.error = "Failed to delete dataset \"" + this.currentDsSlug + "\"";
                    console.error(ret);
                    this.$set(ds, 'deleting', false);
                }
            } catch (e) {
                console.error(e);
                this.error = "Failed to delete dataset: " + e.message;
                this.$set(ds, 'deleting', false);
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
                visibility: ds.visibility !== undefined ? ds.visibility : 0
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
                        ...loadingIndicator
                    });

                    let ret = await this.org.createDataset(newds.slug, newds.name, newds.visibility);
                    if (ret) {
                        // Find and update the temporary dataset
                        const index = this.datasets.findIndex(ds => ds.isTemporary && ds.slug === newds.slug);
                        if (index !== -1) {
                            // Replace the temporary entry with final data
                            this.$set(this.datasets, index, {
                                slug: newds.slug,
                                creationDate: Date.now(),
                                visibility: newds.visibility,
                                entries: 0,
                                size: 0,
                                editing: false,
                                deleting: false,
                                name: newds.name
                            });
                        }
                    } else {
                        // Remove the temporary dataset on error
                        this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                        this.error = "Failed to create dataset \"" + newds.slug + "\"";
                        console.error(ret);
                    }
                } catch (e) {
                    // Remove the temporary dataset on error
                    this.datasets = this.datasets.filter(ds => !(ds.isTemporary && ds.slug === newds.slug));
                    console.error(e);
                    this.error = "Failed to create dataset: " + e.message;
                }

            } else if (this.dsDialogMode == "edit") {
                let ds = this.dsDialogModel;
                this.dsDialogModel = null;

                let dsitem = this.datasets.find(o => o.slug == ds.slug);
                this.$set(dsitem, 'editing', true);

                try {
                    // Use renameDataset function to update name and slug
                    let ret = await renameDataset(this.$route.params.org, ds.slug, newds.name);

                    if (ret) {
                        // Also update visibility if needed
                        let dsobj = this.org.Dataset(ret.slug);
                        let update = await dsobj.update(newds.name, newds.visibility);

                        if (update) {
                            // Update the object in the local dataset
                            this.$set(dsitem, 'slug', ret.slug);
                            this.$set(dsitem, 'name', newds.name);
                            this.$set(dsitem, 'visibility', newds.visibility);
                        }
                    } else {
                        this.error = `Failed to update dataset \"${ds.slug}\"`;
                    }
                } catch (e) {
                    console.error(e);
                    this.error = "Failed to update dataset: " + e.message;
                }

                this.$set(dsitem, 'editing', false);
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

        upload: function () {
            this.$router.push({ name: "Upload" });
        }
    }
}
</script>

<style scoped>
#datasets {
    margin: 12px;

    .top-banner {
        margin-top: 12px;
        margin-bottom: 24px;
    }

    .filter-controls {
        margin-bottom: 20px;
    }

    .ui.table {
        .ds-name {
            font-weight: bold;
        }

        th {
            cursor: pointer;
            user-select: none;

            &:hover {
                background: rgba(0, 0, 0, 0.05);
            }
        }

        .clickable-row {
            cursor: pointer;

            &:hover {
                background-color: #f5f5f5;
            }
        }
    }

    .ui.pagination.menu {
        box-shadow: none;
        border: none;

        .active.item {
            background-color: rgba(0, 0, 0, 0.05);
        }
    }

    .ui.input.labeled {
        input {
            border-radius: 0;
        }
    }

    /* Responsive adjustments */
    @media screen and (max-width: 768px) {
        .ui.table {

            td,
            th {
                padding: 0.5em;
            }
        }
    }

    @media screen and (max-width: 576px) {
        .ui.stackable.grid>.column:not(.row) {
            padding: 0.5rem 0 !important;
        }
    }
}
</style>
