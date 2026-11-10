<template>
    <div id="organizations" ref="page" :class="{ 'page-column': view !== 'map' }">
        <!-- A list keeps the width of --ddb-page-max-width, centred (FR-XC-33, FR-ORG-24); the map takes the whole screen -->

        <div v-if="!loadKind" class="org-page-header">
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
                            </div>
                            <p class="org-description mt-1 mb-0">Organize your datasets into groups and manage team access.</p>
                        </div>
                    </div>
                </div>
                <div v-if="!readyOnly" class="org-actions">
                    <Button severity="primary" size="small" icon="fa-solid fa-plus" aria-label="Create organization" class="d-inline-flex d-sm-none"
                            :loading="creatingOrganization" :disabled="creatingOrganization" @click.stop="handleNew()" />
                    <Button severity="primary" size="small" icon="fa-solid fa-plus" label="Create Organization" class="d-none d-sm-inline-flex"
                            :loading="creatingOrganization" :disabled="creatingOrganization" @click.stop="handleNew()" />
                </div>
            </div>
        </div>

        <!-- Which organizations, and how they are shown: the search and Show all filter the list and the map -->
        <ListToolbar v-if="!loadKind" ref="searchField" v-model:search="searchQuery" search-label="Search organizations">
            <template #start>
                <div class="d-flex align-items-center gap-2">
                    <ToggleSwitch v-model="showAll" input-id="organizations-show-all" />
                    <label for="organizations-show-all" class="show-all-label">Show all</label>
                </div>
            </template>
            <template #end>
                <UnlocatedDatasetsButton v-if="view === 'map'" :groups="locationGroups" show-organization />
                <SortSelect v-if="view === 'list'" v-model:column="sortColumn" v-model:direction="sortDirection" :options="ORG_SORT_OPTIONS"
                            label="Sort organizations by" />
                <ViewSelect v-model="view" label="Show the organizations as" />
            </template>
        </ListToolbar>

        <!-- The list did not load: sign in (a visitor without a session), or no access; no header, cards or actions -->
        <ResourceState v-if="loadKind" :kind="loadKind" resource="page" />

        <!-- Skeleton loading state -->
        <div v-else-if="showSkeleton" ref="cardsArea" class="org-cards-area">
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
            <EmptyState v-if="paginatedOrganizations.length === 0" title="No organizations found" items="organizations" :query="searchQuery"
                        @clear="searchQuery = ''; $refs.searchField?.focus()">
                <!-- The default list holds the organizations the user owns, belongs to, or that are Public (D-003) -->
                <p v-if="!showAll" data-org-empty-hint>No organizations yet: you don't own or belong to any, and none is public.</p>
                <p v-else data-org-empty-hint>No organizations yet.</p>
                <Button v-if="!readyOnly" severity="primary" size="small" icon="fa-solid fa-plus" label="Create Organization"
                        data-org-empty-create :loading="creatingOrganization" :disabled="creatingOrganization" @click.stop="handleNew()" />
            </EmptyState>
            <div v-for="org in paginatedOrganizations" :key="org.slug" class="org-card">
                <Card>
                    <template #content>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1 org-card-main">
                                <div class="d-flex align-items-center gap-2">
                                    <i class="fa-solid fa-sitemap" aria-hidden="true" />
                                    <!-- The whole card opens the organization (stretched link) -->
                                    <router-link :to="{ name: 'Datasets', params: { org: org.slug } }" class="org-name stretched-link" :title="org.name ? org.name : org.slug">
                                        {{ org.name ? org.name : org.slug }}
                                    </router-link>
                                </div>
                                <div v-if="org.description" class="org-card-description mt-1" :title="org.description">{{ org.description }}</div>
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
                                <VisibilityTag rounded :visibility="org.isPublic ? Visibility.PUBLIC : Visibility.PRIVATE" />
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
        <div v-if="!loadKind && !showSkeleton && view === 'list' && filteredOrganizations.length > 0" class="org-pagination">
            <Paginator :rows="Number(itemsPerPage)" :total-records="filteredOrganizations.length"
                       :first="(currentPage - 1) * itemsPerPage" @page="onPageChange">
                <!-- The size that fits reads "N (fit)": picking it stores no size (FR-XC-34) -->
                <template #end>
                    <Select :model-value="itemsPerPage" :options="pageSizeChoices" option-label="label" option-value="value"
                            aria-label="Organizations per page" class="page-size-select"
                            @update:model-value="size => onPageChange({ page: currentPage - 1, rows: size })" />
                </template>
            </Paginator>
        </div>

        <DialogHost :dialogs="dialogs" />
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @close="handleMessageClose" />
        <OrganizationDialog v-if="orgDialogOpen" :mode="orgDialogMode" :model="orgDialogModel"
                            :forbidden-slugs="organizations.map(o => o.slug)" :save="saveOrganization"
                            @close="handleOrganizationClose" />
        <OrganizationMembersDialog v-if="membersDialogOpen"
                                   :org-slug="selectedOrgForMembers.slug"
                                   :can-manage-members="selectedOrgForMembers.permissions?.canManageMembers || false"
                                   @permissions-changed="onMembersPermissionsChanged"
                                   @close="closeMembersDialog" />

    </div>
</template>

<script>
import EmptyState from '@/components/EmptyState.vue';
import ResourceState from '@/components/ResourceState.vue';
import VisibilityTag from '@/components/VisibilityTag.vue';
import SortSelect from '@/components/SortSelect.vue';
import ViewSelect from '@/components/ViewSelect.vue';
import ListToolbar from '@/components/ListToolbar.vue';
import { DatasetLocationsMap } from '@/features/datasets/locationsMap';
import UnlocatedDatasetsButton from '@/features/datasets/UnlocatedDatasetsButton.vue';
import { createLocationFanOut } from '@/libs/locationFanOut';
import { ref, shallowRef } from 'vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useEntityDelete } from '@/composables/useEntityDelete';
import OrganizationDialog from './OrganizationDialog.vue';
import OrganizationMembersDialog from './OrganizationMembersDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import { setTitle } from '@/libs/utils';
import { countOf, formatDateTime, formatTimeAgo } from '@/libs/format';
import { ORG_SORT_OPTIONS, organizationRow, sortOrganizations } from '@/libs/organizationList';
import { usePageSize, visibleListHeight, heightOfFirst, averageRowHeight } from '@/composables/usePageSize';
import { useMediaMatch } from '@/composables/useStackedLayout';
import { XWIDE_MEDIA_QUERY } from '@/libs/responsiveColumns';
import { pageAfterResize } from '@/libs/pageSize';
import { getOrgPageSettings, saveOrgPageSettings, followOrgPageSettings, getOrgPagePosition, saveOrgPagePosition } from '@/libs/storageUtils';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Skeleton from 'primevue/skeleton';
import ToggleSwitch from 'primevue/toggleswitch';
import Paginator from 'primevue/paginator';
import Select from 'primevue/select';
import { loadErrorKind } from '@/libs/ddb/apiError';
import { Visibility } from 'ddb';

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
        ResourceState,
        SortSelect,
        ViewSelect,
        ListToolbar,
        DatasetLocationsMap,
        UnlocatedDatasetsButton,
        DialogHost,
        MessageDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Button,
        Card,
        Tag,
        VisibilityTag,
        Skeleton,
        ToggleSwitch,
        Paginator,
        Select
    },

    setup() {
        const dialogs = useDialogs();
        // A page holds the cards that fit the height until the user chooses a size, which the preferences keep (FR-XC-34).
        // The cards are one column, two from xwide (the grid of .org-cards-area, FR-ORG-24): a page holds whole grid rows,
        // the rows that fit times the cards in a row. The column change comes with a resize, which measures again
        const cardsArea = ref(null);
        const page = ref(null);
        const twoColumns = useMediaMatch(XWIDE_MEDIA_QUERY);
        const sizing = usePageSize({
            height: () => visibleListHeight({
                area: page.value, list: cardsArea.value,
                reserved: () => heightOfFirst(page.value, '.org-pagination', 49)
            }),
            rowHeight: () => averageRowHeight(cardsArea.value, ':scope > .org-card, :scope > .p-card', 100),
            columns: () => (twoColumns.value ? 2 : 1),
            initial: getOrgPageSettings().itemsPerPage
        });
        // The locations are many small objects the map reads whole: not made reactive
        return { dialogs, deleteEntity: useEntityDelete(dialogs), ORG_SORT_OPTIONS, Visibility, formatDateTime, formatTimeAgo, locationGroups: shallowRef([]), ...sizing, cardsArea, page };
    },
    data: function () {
        const settings = getOrgPageSettings();
        return {
            error: "",
            // The list did not load: sign in, no access (ResourceState, FR-XC-13)
            loadError: null,
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
            // The page the user left (getOrgPagePosition) is shown once the size that fits is known, in mounted
            currentPage: 1,

            sortColumn: settings.sortColumn,
            sortDirection: settings.sortDirection,

            // The cards or the map of where the datasets of the filtered organizations are
            view: settings.view,
            locationsLoading: false
        }
    },

    computed: {
        // The page state of a list that did not load (loadErrorKind), or null
        loadKind: function () {
            return loadErrorKind(this.loadError);
        },
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
        // Cards per page: the size the user chose, else the cards that fit the height (FR-XC-34)
        itemsPerPage() {
            return this.pageSize;
        },
        // The last page of the filtered list at this size
        lastPage() {
            return Math.max(1, Math.ceil(this.filteredOrganizations.length / this.itemsPerPage));
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
        // Another size: the page that holds the first organization shown
        itemsPerPage: function (size, previous) {
            this.currentPage = pageAfterResize(this.currentPage, previous, size);
        },
        // Only a size the user chose is a preference
        pageChoice: function () {
            this.saveSettings();
        },
        // A page the list no longer has (a position kept at another size, a list that shrank): the last one
        lastPage: function (last) {
            if (this.loaded && this.currentPage > last) this.currentPage = last;
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
        view: function (view) {
            this.saveSettings();
            // The cards are back on the page: measure them
            if (view === 'list') this.$nextTick(() => this.measurePageSize());
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
            this.pageChoice = settings.itemsPerPage;
            this.showAll = !settings.ownedOnly;
            this.sortColumn = settings.sortColumn;
            this.sortDirection = settings.sortDirection;
            this.view = settings.view;
        });
    },
    mounted: async function () {
        setTitle("Organizations");
        await this.fetchOrganizations();
        // The cards are on the page: their height may differ from the one expected, and so the size that fits.
        // The page the user left was counted in the cards of that size: it is shown once the size is known
        await this.$nextTick();
        this.measurePageSize();
        await this.$nextTick();
        const { currentPage, scrollTop } = getOrgPagePosition();
        if (currentPage > 1) this.currentPage = Math.min(currentPage, this.lastPage);
        if (scrollTop) {
            this.$nextTick(() => {
                if (this.cardsArea) {
                    this.cardsArea.scrollTop = scrollTop;
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
        // dropped whenever it arrives, so the list always matches the filter last chosen.
        // True when this answer became the list (not an error, not superseded).
        async fetchOrganizations() {
            // The number of the last list asked: only its answer is shown
            const request = this._organizationsRequest = (this._organizationsRequest ?? 0) + 1;
            const isLatest = () => request === this._organizationsRequest;
            this.loading = true;
            let listed = false;
            try {
                this.isAdmin = reg.isAdmin();

                const tmp = await reg.orgs.getOrganizations(!this.showAll);

                if (isLatest()) {
                    this.organizations = tmp.map(item => organizationRow(item.org));
                    this.loadError = null;
                    listed = true;
                }
            } catch (e) {
                // A 401 to a visitor without a session (D-048) or a 403: the page state in place of the
                // list (with a session, a 401 has already sent the user to Login); other errors are a toast
                if (isLatest()) {
                    if (loadErrorKind(e)) this.loadError = e;
                    else this.$notify.error(e.message);
                }
            }
            if (!isLatest()) return false;
            this.loading = false;
            this.loaded = true;
            // A position kept at another size may be past the last page
            if (this.currentPage > this.lastPage) this.currentPage = this.lastPage;
            return listed;
        },

        // Only a change of the user stores the list settings, which follow the account; leaving
        // the page or turning a page stores the position alone
        saveSettings() {
            saveOrgPageSettings({
                itemsPerPage: this.pageChoice,
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
            saveOrgPagePosition(this.currentPage, this.cardsArea?.scrollTop ?? 0);
        },

        // The watchers store what changed, and keep the page that holds the first card shown when a size is picked
        onPageChange(event) {
            if (event.rows !== this.itemsPerPage) this.choosePageSize(event.rows);
            else this.currentPage = event.page + 1;
        },

        handleDelete(org) {
            this.deleteEntity(org, {
                kind: 'organization',
                name: org.name,
                lost: org.datasetCount != null ? [`${countOf(org.datasetCount, 'dataset')} and their files`] : [],
                // One Enter must not delete an organization and all its datasets: its slug is typed
                typed: true,
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

        // The dialog is closed when the organization is saved or the user gives up; a failure of the save stays in the
        // dialog, at the field the Registry names, with the typed values (FR-ORG-04)
        handleOrganizationClose() {
            this.orgDialogOpen = false;
            this.orgDialogModel = null;
        },

        /**
         * The request of the dialog: creates or updates the organization and the list. A failure is thrown for the dialog
         * to show (it names the field, D-047), so the dialog stays open with what the user typed.
         */
        async saveOrganization(neworg) {
            if (this.orgDialogMode == "new") {
                this.creatingOrganization = true;

                try {
                    const ret = await reg.orgs.createOrganization({
                        slug: neworg.slug,
                        name: neworg.name,
                        description: neworg.description,
                        isPublic: neworg.isPublic
                    });
                    if (!ret) throw new Error('Failed to create organization "' + neworg.slug + '"');

                    // The organization as the server made it, with its dates; the answer carries
                    // no permissions (the creator owns it)
                    const created = organizationRow(ret);
                    this.organizations.push({
                        ...created,
                        owner: created.owner || this.userName,
                        permissions: created.permissions ?? CREATOR_PERMISSIONS
                    });
                    this.$notify.success('Organization created successfully', { summary: 'Organization Created' });
                } finally {
                    this.creatingOrganization = false;
                }
            } else if (this.orgDialogMode == "edit") {
                const org = this.orgDialogModel;
                if (!org) return;
                this.loading = true;

                try {
                    const ret = await reg.orgs.updateOrganization(org.slug, neworg.name, neworg.description, neworg.isPublic);
                    if (!ret) throw new Error('Failed to update organization "' + org.slug + '"');

                    const orgitem = this.organizations.find(o => o.slug == org.slug);
                    orgitem.slug = org.slug;
                    orgitem.name = neworg.name;
                    orgitem.description = neworg.description;
                    orgitem.isPublic = neworg.isPublic;
                    this.$notify.success('Organization updated successfully', { summary: 'Organization Updated' });
                } finally {
                    this.loading = false;
                }
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

        // The user changed their own permissions: the list says what they may do now, and the
        // open dialog follows it (read-only once they are no longer an admin)
        async onMembersPermissionsChanged() {
            const slug = this.selectedOrgForMembers?.slug;
            const listed = await this.fetchOrganizations();
            if (!this.membersDialogOpen || !this.selectedOrgForMembers) return;
            const row = listed ? this.organizations.find(o => o.slug === slug) : null;
            // No fresh answer (an error, a superseded request, or the organization left the
            // list): the rows may still hold the old permissions, so read-only, to be safe
            this.selectedOrgForMembers = row || {
                ...this.selectedOrgForMembers,
                permissions: { ...this.selectedOrgForMembers.permissions, canManageMembers: false }
            };
        },

        upload: function () {
            this.$router.push({ name: "Upload" });
        }
    }
}
</script>

<style scoped lang="scss">
@use '../../../css/breakpoints' as *;

#organizations {
    /* The space around the page is its padding, so the column of .page-column keeps it on a narrow screen */
    padding: 0.75rem;
    box-sizing: border-box;
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

    /* The focus ring of a card lies outside it: the box keeps the ring's reach clear above and beside
       the cards, so it does not clip the ring of the first one (FR-ORG-07) */
    /* The cards keep their height, so the paginator is right below the last one; the area shrinks and
       scrolls its cards only when they are more than the screen holds (FR-ORG-25) */
    .org-cards-area {
        flex: 0 1 auto;
        overflow-y: auto;
        min-height: 0;
        padding: var(--ddb-focus-ring-reach) var(--ddb-focus-ring-reach) 0;

        /* A 4K screen shows two columns of cards, not one card with its name and its buttons far apart (FR-ORG-24) */
        @include xwide-up {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(40rem, 1fr));
            column-gap: var(--ddb-spacing-md);
            align-content: start;

            > :not(.org-card) {
                grid-column: 1 / -1;
            }
        }
    }

    .org-map-area {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    /* The page size select follows the page links */
    .org-pagination :deep(.p-paginator-content-end) {
        margin-inline-start: 0;
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
            /* A long name is two lines, the whole of it in the tooltip (FR-ORG-14) */
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            overflow: hidden;
        }

        .org-name:focus-visible {
            outline: none;
        }

        /* The ring of the Hub (the --ddb-focus-ring-* set) around the whole card */
        &:has(.org-name:focus-visible) {
            outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
            outline-offset: var(--ddb-focus-ring-offset);
            border-radius: var(--ddb-radius-sm);
        }

        .org-card-description {
            color: var(--ddb-text-secondary);
            font-size: var(--ddb-font-size-sm);
            overflow-wrap: anywhere;
            /* A long description is two lines, the whole of it in the tooltip (FR-ORG-14) */
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            overflow: hidden;
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
