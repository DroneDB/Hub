<template>
    <div id="organizations">

        <div class="org-page-header">
            <div class="org-header-layout">
                <div class="org-identity">
                    <div class="d-flex align-items-center gap-3">
                        <div class="org-icon-wrapper d-flex align-items-center justify-content-center">
                            <i class="fa-solid fa-sitemap" />
                        </div>
                        <div>
                            <div class="org-title-row">
                                <h1 class="my-0">Organizations</h1>
                                <Tag rounded severity="info" icon="fa-solid fa-layer-group">
                                    {{ filteredOrganizations.length }}
                                </Tag>
                                <div class="d-flex align-items-center gap-2 ms-2">
                                    <ToggleSwitch v-model="showAll" input-id="organizations-show-all" />
                                    <label for="organizations-show-all" class="show-all-label">Show all</label>
                                </div>
                            </div>
                            <p class="org-description mt-1 mb-0">Organize your datasets into groups and manage team access.</p>
                        </div>
                    </div>
                </div>
                <div class="org-actions">
                    <IconField>
                        <InputIcon class="fa-solid fa-magnifying-glass" />
                        <InputText v-model="searchQuery" small placeholder="Search organizations" aria-label="Search organizations" />
                    </IconField>
                    <ViewSelect v-model="view" label="Show the organizations as" />
                    <SortSelect v-if="view === 'list'" v-model:column="sortColumn" v-model:direction="sortDirection" :options="ORG_SORT_OPTIONS"
                                label="Sort organizations by" />
                    <Button v-if="!readyOnly" severity="primary" size="small" icon="fa-solid fa-plus" aria-label="Create organization" class="d-inline-flex d-sm-none"
                            :loading="creatingOrganization" :disabled="creatingOrganization" @click.stop="handleNew()" />
                    <Button v-if="!readyOnly" severity="primary" size="small" icon="fa-solid fa-plus" label="Create Organization" class="d-none d-sm-inline-flex"
                            :loading="creatingOrganization" :disabled="creatingOrganization" @click.stop="handleNew()" />
                </div>
            </div>
        </div>

        <!-- Skeleton loading state -->
        <div v-if="showSkeleton" class="org-cards-area">
            <Card v-for="i in 4" :key="i" class="mb-3">
                <template #content>
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1 d-flex align-items-center">
                            <Skeleton shape="circle" size="1.5rem" class="me-3" />
                            <Skeleton width="12rem" height="1.25rem" />
                        </div>
                        <div class="me-3">
                            <Skeleton width="4.5rem" height="1.5rem" border-radius="1rem" />
                        </div>
                        <div class="d-flex gap-1">
                            <Skeleton width="2rem" height="2rem" />
                            <Skeleton width="2rem" height="2rem" />
                        </div>
                    </div>
                </template>
            </Card>
        </div>

        <!-- The datasets of the filtered organizations on a map -->
        <div v-else-if="view === 'map'" class="org-map-area">
            <!-- A reload of the list keeps the map, its zoom and its colours, and shows as loading -->
            <!-- The colours follow all the organizations listed, so a search or the order of the answers does not change them -->
            <DatasetLocationsMap :groups="locationGroups" :organizations="organizationSlugs" :loading="locationsLoading || loading" />
        </div>

        <!-- Data loaded -->
        <div v-else ref="cardsArea" class="org-cards-area">
            <EmptyState v-if="paginatedOrganizations.length === 0" title="No organizations found" :filtered="!!searchQuery">
                <p v-if="!showAll">You don't own any organizations yet. You may have access to organizations owned by others: enable <b>Show all</b> above to see them. You can also create a new organization.</p>
                <p v-else>You can create a new organization by clicking the create organization button.</p>
            </EmptyState>
            <div v-for="org in paginatedOrganizations" :key="org.slug" class="org-card">
                <Card>
                    <template #content>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1 org-card-main">
                                <div class="d-flex align-items-center gap-2">
                                    <i class="fa-solid fa-sitemap" aria-hidden="true" />
                                    <!-- The whole card opens the organization (stretched link) -->
                                    <router-link :to="{ name: 'Datasets', params: { org: org.slug } }" class="org-name stretched-link">
                                        {{ org.name ? org.name : org.slug }}
                                    </router-link>
                                </div>
                                <div v-if="org.description" class="org-card-description mt-1">{{ org.description }}</div>
                                <div v-if="org.lastModified != null || org.datasetCount != null" class="org-card-stats mt-1">
                                    <span v-if="org.datasetCount != null">{{ org.datasetCount }} {{ org.datasetCount === 1 ? 'dataset' : 'datasets' }}</span>
                                    <span v-if="org.datasetCount != null && org.lastModified != null" aria-hidden="true">&middot;</span>
                                    <span v-if="org.lastModified != null" :title="formatDateTime(org.lastModified)">Modified {{ formatTimeAgo(org.lastModified) }}</span>
                                </div>
                            </div>
                            <div class="d-flex align-items-center gap-2 ms-3 org-card-tags">
                                <Tag v-if="org.owner" rounded severity="secondary" icon="fa-solid fa-user">
                                    {{ org.owner }}
                                </Tag>
                                <Tag v-if="org.isPublic" rounded severity="success" icon="fa-solid fa-globe">Public</Tag>
                                <Tag v-else rounded severity="warn" icon="fa-solid fa-lock">Private</Tag>
                            </div>
                            <div class="org-card-actions d-flex gap-1 ms-3">
                                <Button v-if="memberManagementEnabled && !readyOnly && org.permissions?.canManageMembers"
                                        severity="secondary" outlined size="small" icon="fa-solid fa-users"
                                        title="Manage Members" aria-label="Manage members" @click.stop="openMembersDialog(org)" />
                                <Button v-if="!readyOnly && org.permissions?.canWrite && org.slug !== 'public'"
                                        severity="secondary" outlined size="small" :loading="org.editing"
                                        :disabled="org.editing || org.deleting" icon="fa-solid fa-pencil"
                                        title="Edit" aria-label="Edit organization" @click.stop="handleEdit(org)" />
                                <Button v-if="!readyOnly && org.permissions?.canDelete && org.slug !== 'public'"
                                        severity="danger" size="small" :loading="org.deleting"
                                        :disabled="org.deleting || org.editing" icon="fa-solid fa-trash"
                                        title="Delete" aria-label="Delete organization" @click.stop="handleDelete(org)" />
                            </div>
                        </div>
                    </template>
                </Card>
            </div>
        </div>

        <!-- Sticky paginator -->
        <div v-if="!showSkeleton && view === 'list'" class="org-pagination">
            <Paginator :rows="Number(itemsPerPage)" :total-records="filteredOrganizations.length"
                       :first="(currentPage - 1) * itemsPerPage"
                       :rows-per-page-options="[5, 10, 25, 50, 100]" @page="onPageChange" />
        </div>

        <DialogHost :dialogs="dialogs" />
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @close="handleMessageClose" />
        <OrganizationDialog v-if="orgDialogOpen" :mode="orgDialogMode" :model="orgDialogModel"
                            @close="handleOrganizationClose" />
        <OrganizationMembersDialog v-if="membersDialogOpen"
                                   :org-slug="selectedOrgForMembers.slug"
                                   :can-manage-members="selectedOrgForMembers.permissions?.canManageMembers || false"
                                   @close="closeMembersDialog" />

    </div>
</template>

<script>
import EmptyState from '@/components/EmptyState.vue';
import SortSelect from '@/components/SortSelect.vue';
import ViewSelect from '@/components/ViewSelect.vue';
import { DatasetLocationsMap } from '@/features/datasets/locationsMap';
import { createLocationFanOut } from '@/libs/locationFanOut';
import { shallowRef } from 'vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useEntityDelete } from '@/composables/useEntityDelete';
import OrganizationDialog from './OrganizationDialog.vue';
import OrganizationMembersDialog from './OrganizationMembersDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import { setTitle } from '@/libs/utils';
import { formatDateTime, formatTimeAgo } from '@/libs/format';
import { ORG_SORT_OPTIONS, organizationRow, sortOrganizations } from '@/libs/organizationList';
import { getOrgPageSettings, saveOrgPageSettings, followOrgPageSettings, getOrgPagePosition, saveOrgPagePosition } from '@/libs/storageUtils';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Skeleton from 'primevue/skeleton';
import ToggleSwitch from 'primevue/toggleswitch';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import Paginator from 'primevue/paginator';
import { isUnauthorized } from '@/libs/ddb/apiError';

// Typing in the search box asks the server once the user pauses
const SEARCH_DELAY_MS = 300;

// What the creator of an organization can do with it
const CREATOR_PERMISSIONS = Object.freeze({ canRead: true, canWrite: true, canDelete: true, canManageMembers: true });

/**
 * Organizations - Admin panel for managing platform organizations.
 *
 * Lists all organizations in a paginated DataTable and provides dialogs
 * for creating, editing, and deleting organizations.
 */
export default {
    name: 'OrganizationsPage',
    components: {
        EmptyState,
        SortSelect,
        ViewSelect,
        DatasetLocationsMap,
        DialogHost,
        MessageDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Button,
        Card,
        Tag,
        Skeleton,
        ToggleSwitch,
        InputText,
        InputIcon,
        IconField,
        Paginator
    },

    setup() {
        const dialogs = useDialogs();
        // The locations are many small objects the map reads whole: not made reactive
        return { dialogs, deleteEntity: useEntityDelete(dialogs), ORG_SORT_OPTIONS, formatDateTime, formatTimeAgo, locationGroups: shallowRef([]) };
    },
    data: function () {
        const settings = getOrgPageSettings();
        return {
            error: "",
            organizations: [],
            // The list is being asked; `loaded` once a first answer came
            loading: true,
            loaded: false,
            messageDialogOpen: false,
            currentMessage: null,
            userName: reg.getUsername(),
            isAdmin: false,

            orgDialogModel: null,
            orgDialogMode: null,
            orgDialogOpen: false,
            // An organization is being created: the list (or the map) stays as it is meanwhile
            creatingOrganization: false,

            membersDialogOpen: false,
            selectedOrgForMembers: null,

            showAll: !settings.ownedOnly,
            searchQuery: '',
            currentPage: getOrgPagePosition().currentPage || 1,
            itemsPerPage: settings.itemsPerPage,

            sortColumn: settings.sortColumn,
            sortDirection: settings.sortDirection,

            // The cards or the map of where the datasets of the filtered organizations are
            view: settings.view,
            locationsLoading: false
        }
    },

    computed: {
        readyOnly: function () {
            return HubOptions.readOnlyOrgs;
        },
        memberManagementEnabled() {
            return reg.features.get(Features.ORGANIZATION_MEMBER_MANAGEMENT);
        },
        filteredOrganizations() {
            const query = this.searchQuery.toLowerCase();
            const matching = !query ? this.organizations : this.organizations.filter(org => {
                const name = (org.name || org.slug).toLowerCase();
                const slug = org.slug.toLowerCase();
                const description = (org.description || '').toLowerCase();
                const owner = (org.owner || '').toLowerCase();
                return name.includes(query) || slug.includes(query) || description.includes(query) || owner.includes(query);
            });
            return sortOrganizations(matching, this.sortColumn, this.sortDirection);
        },
        // The cards wait for the list; the map, once shown, stays while the list is asked again
        showSkeleton() {
            return this.loading && (!this.loaded || this.view !== 'map');
        },
        paginatedOrganizations() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            return this.filteredOrganizations.slice(start, start + this.itemsPerPage);
        },
        // The filtered organizations whose locations are asked: one known to hold no dataset has
        // nothing to ask for
        locatedOrganizations() {
            return this.filteredOrganizations.filter(org => org.datasetCount !== 0);
        },
        // Every organization listed, filtered or not
        organizationSlugs() {
            return this.organizations.map(org => org.slug);
        },
        // Which organizations are located, whatever their order: a new sort asks for nothing, and
        // an organization whose datasets come or go is asked for or dropped
        locatedKey() {
            return this.locatedOrganizations.map(org => org.slug).sort().join('\n');
        }
    },
    watch: {
        showAll: async function () {
            this.currentPage = 1;
            this.saveSettings();
            await this.fetchOrganizations();
        },
        itemsPerPage: function () {
            this.currentPage = 1;
            this.saveSettings();
        },
        sortColumn: function () {
            this.currentPage = 1;
            this.saveSettings();
        },
        sortDirection: function () {
            this.currentPage = 1;
            this.saveSettings();
        },
        currentPage: function () {
            this.savePosition();
        },
        searchQuery: function () {
            this.currentPage = 1;
        },
        view: function () {
            this.saveSettings();
            this.followLocations();
        },
        locatedKey: function () {
            this.followLocations();
        }
    },
    created() {
        // The search the locations were last asked for
        this._locationSearch = '';
        this._locations = createLocationFanOut({
            fetchLocations: (slug, opts) => reg.Organization(slug).datasetLocations(opts),
            onChange: () => this.showLocations()
        });
        // The list settings follow the Preferences page, other tabs and the account; the watchers
        // above do not store them again (saveOrgPageSettings skips the values already stored)
        this._stopFollowingSettings = followOrgPageSettings(settings => {
            this.itemsPerPage = settings.itemsPerPage;
            this.showAll = !settings.ownedOnly;
            this.sortColumn = settings.sortColumn;
            this.sortDirection = settings.sortDirection;
            this.view = settings.view;
        });
    },
    mounted: async function () {
        setTitle("Organizations");
        await this.fetchOrganizations();
        const { scrollTop } = getOrgPagePosition();
        if (scrollTop) {
            this.$nextTick(() => {
                if (this.$refs.cardsArea) {
                    this.$refs.cardsArea.scrollTop = scrollTop;
                }
            });
        }
    },
    beforeUnmount() {
        this._stopFollowingSettings?.();
        this.stopLocations();
        this.savePosition();
    },
    methods: {

        // A list asked while another is in flight replaces it: the older answer (or error) is
        // dropped whenever it arrives, so the list always matches the filter last chosen
        async fetchOrganizations() {
            // The number of the last list asked: only its answer is shown
            const request = this._organizationsRequest = (this._organizationsRequest ?? 0) + 1;
            const isLatest = () => request === this._organizationsRequest;
            this.loading = true;
            try {
                this.isAdmin = reg.isAdmin();

                const tmp = await reg.orgs.getOrganizations(!this.showAll);

                if (isLatest()) this.organizations = tmp.map(item => organizationRow(item.org));
            } catch (e) {
                // A 401 is handled by reg.onUnauthorized (end the session, sign in)
                if (isLatest() && !isUnauthorized(e)) this.$notify.error(e.message);
            }
            if (!isLatest()) return;
            this.loading = false;
            this.loaded = true;
        },

        // Only a change of the user stores the list settings, which follow the account; leaving
        // the page or turning a page stores the position alone
        saveSettings() {
            saveOrgPageSettings({
                itemsPerPage: this.itemsPerPage,
                ownedOnly: !this.showAll,
                sortColumn: this.sortColumn,
                sortDirection: this.sortDirection,
                view: this.view
            });
        },

        // The map shows the datasets of the filtered organizations, all pages of them. A change
        // of the filter ends the requests of the organizations it leaves out and drops their pins
        // at once, keeps those of the organizations still in it, and asks for those it brings in;
        // while the search is being typed these wait for the user to pause
        followLocations() {
            this.clearLocationTimer();
            if (this.view !== 'map') {
                this._locations.stop();
            } else if (this.searchQuery === this._locationSearch) {
                this._locations.update(this.locatedOrganizations);
            } else {
                this._locationTimer = setTimeout(() => {
                    this._locationTimer = null;
                    this._locationSearch = this.searchQuery;
                    this._locations.update(this.locatedOrganizations);
                }, SEARCH_DELAY_MS);
                this._locations.keepOnly(this.locatedOrganizations);
            }
        },

        // The pins of the answers so far; the map is loading while an answer or the pause in the
        // typing is awaited
        showLocations() {
            this.locationGroups = this._locations.groups;
            this.locationsLoading = this._locations.loading || this._locationTimer != null;
        },

        clearLocationTimer() {
            clearTimeout(this._locationTimer);
            this._locationTimer = null;
        },

        // Ends the requests in flight and drops the pins
        stopLocations() {
            this.clearLocationTimer();
            this._locations.stop();
        },

        savePosition() {
            saveOrgPagePosition(this.currentPage, this.$refs.cardsArea?.scrollTop ?? 0);
        },

        // The watchers store what changed
        onPageChange(event) {
            this.currentPage = event.page + 1;
            this.itemsPerPage = event.rows;
        },

        handleDelete(org) {
            this.deleteEntity(org, {
                kind: 'organization',
                warning: 'All the datasets owned by this organization will be deleted too.',
                remove: () => reg.orgs.deleteOrganization(org.slug),
                done: () => { this.organizations = this.organizations.filter(o => o.slug !== org.slug); }
            });
        },

        editOrganization(org) {
            this.orgDialogModel = {
                slug: org.slug,
                name: org.name,
                description: org.description,
                isPublic: org.isPublic
            };
            this.orgDialogMode = "edit";
            this.orgDialogOpen = true;
        },

        newOrganization() {
            this.orgDialogMode = "new";
            this.orgDialogOpen = true;
        },

        handleNew() {
            this.newOrganization();
        },

        async handleOrganizationClose(res, neworg) {
            this.orgDialogOpen = false;

            if (res == "close" || !neworg) {
                this.orgDialogModel = null;
                return;
            }

            if (this.orgDialogMode == "new") {
                this.orgDialogModel = null;
                this.orgDialogOpen = false;
                this.creatingOrganization = true;

                try {
                    let ret = await reg.orgs.createOrganization({
                        slug: neworg.slug,
                        name: neworg.name,
                        description: neworg.description,
                        isPublic: neworg.isPublic
                    });
                    if (ret) {
                        // The organization as the server made it, with its dates; the answer carries
                        // no permissions (the creator owns it)
                        const created = organizationRow(ret);
                        this.organizations.push({
                            ...created,
                            owner: created.owner || this.userName,
                            permissions: created.permissions ?? CREATOR_PERMISSIONS
                        });
                        this.$notify.success('Organization created successfully', { summary: 'Organization Created' });
                    } else {
                        this.$notify.error('Failed to create organization "' + neworg.slug + '"');
                        console.error(ret);
                    }
                } catch (e) {
                    console.error(e);
                    this.$notify.error('Failed to create organization: ' + e.message);
                }
                this.creatingOrganization = false;

            } else if (this.orgDialogMode == "edit") {
                let org = this.orgDialogModel;
                if (!org) return;
                this.orgDialogModel = null;
                this.orgDialogOpen = false;
                this.loading = true;

                try {
                    let ret = await reg.orgs.updateOrganization(org.slug, neworg.name, neworg.description, neworg.isPublic);
                    if (ret) {
                        let orgitem = this.organizations.find(o => o.slug == org.slug);
                        orgitem.slug = org.slug;
                        orgitem.name = neworg.name;
                        orgitem.description = neworg.description;
                        orgitem.isPublic = neworg.isPublic;
                        this.$notify.success('Organization updated successfully', { summary: 'Organization Updated' });
                    } else {
                        this.$notify.error('Failed to update organization "' + org.slug + '"');
                        console.error(ret);
                    }
                } catch (e) {
                    console.error(e);
                    this.$notify.error('Failed to update organization: ' + e.message);
                }
                this.loading = false;
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

        handleEdit(org) {
            this.editOrganization(org);
        },

        openMembersDialog(org) {
            this.selectedOrgForMembers = org;
            this.membersDialogOpen = true;
        },

        closeMembersDialog() {
            this.membersDialogOpen = false;
            this.selectedOrgForMembers = null;
        },

        upload: function () {
            this.$router.push({ name: "Upload" });
        }
    }
}
</script>

<style scoped>
#organizations {
    margin: 0.75rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .org-page-header {
        padding: var(--ddb-spacing-md) 0;
        flex-shrink: 0;

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

    .show-all-label {
        font-size: var(--ddb-font-size-sm);
        white-space: nowrap;
    }

    .org-cards-area {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .org-map-area {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .org-pagination {
        flex-shrink: 0;
        position: sticky;
        bottom: 0;
        z-index: 10;
        background: var(--p-content-background);
        border-top: 1px solid var(--p-content-border-color);
        padding: var(--ddb-spacing-xs) 0;
    }

    .org-card {
        position: relative;
        margin-bottom: var(--ddb-spacing-sm);

        /* Shrinks before the tags and the buttons, which would be pushed out of the card */
        .org-card-main {
            min-width: 0;
        }

        .org-name {
            font-size: 1.25rem;
            font-weight: bold;
            color: inherit;
            text-decoration: none;
            overflow-wrap: anywhere;
        }

        .org-name:focus-visible {
            outline: none;
        }

        &:has(.org-name:focus-visible) {
            outline: 2px solid var(--ddb-primary);
            border-radius: var(--ddb-radius-sm);
        }

        .org-card-description {
            color: var(--ddb-text-secondary);
            font-size: var(--ddb-font-size-sm);
        }

        .org-card-stats {
            display: flex;
            flex-wrap: wrap;
            column-gap: var(--ddb-spacing-sm);
            color: var(--ddb-text-secondary);
            font-size: var(--ddb-font-size-sm);
        }

        .org-card-tags {
            flex-shrink: 0;
        }

        /* Above the stretched link */
        .org-card-actions {
            position: relative;
            z-index: 2;
        }
    }

    /* Responsive */
    @media screen and (max-width: 767.98px) {
        .org-page-header {
            .org-header-layout {
                flex-direction: column;
                gap: var(--ddb-spacing-md);
            }

            /* The search on a row of its own, the view, sort and create controls on the next one:
               in one row they are wider than a phone, and the page (overflow hidden) would cut
               them off, or scroll sideways to the one the user taps */
            .org-actions {
                width: 100%;
                flex-wrap: wrap;

                > .p-iconfield {
                    flex: 1 0 100%;

                    :deep(.p-inputtext) {
                        width: 100%;
                    }
                }

                > .sort-select {
                    flex: 1 1 0;
                }
            }
        }

        .org-card {
            :deep(.p-card-body) {
                padding: var(--ddb-spacing-sm);
            }

            .org-card-tags {
                flex-direction: column;
                align-items: flex-end;
                gap: var(--ddb-spacing-xs);
            }

            .org-card-actions {
                flex-direction: column;
            }
        }
    }
}
</style>
