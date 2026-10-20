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
                                <label class="d-flex align-items-center gap-2 ms-2">
                                    <ToggleSwitch v-model="showAll" />
                                    <span class="show-all-label">Show all</span>
                                </label>
                            </div>
                            <p class="org-description mt-1 mb-0">Organize your datasets into groups and manage team access.</p>
                        </div>
                    </div>
                </div>
                <div class="org-actions">
                    <IconField>
                        <InputIcon class="fa-solid fa-magnifying-glass" />
                        <InputText v-model="searchQuery" small placeholder="Search organizations" />
                    </IconField>
                    <Button v-if="!readyOnly" severity="primary" size="small" icon="fa-solid fa-plus" class="d-inline-flex d-sm-none" @click.stop="handleNew()" />
                    <Button v-if="!readyOnly" severity="primary" size="small" icon="fa-solid fa-plus" label="Create Organization" class="d-none d-sm-inline-flex" @click.stop="handleNew()" />
                </div>
            </div>
        </div>

        <!-- Skeleton loading state -->
        <div v-if="loading" class="org-cards-area">
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

        <!-- Data loaded -->
        <div v-else ref="cardsArea" class="org-cards-area">
            <div v-if="paginatedOrganizations.length === 0" class="text-center p-4">
                <h3>No organizations found</h3>
                <p v-if="searchQuery">Try adjusting your search criteria.</p>
                <p v-else-if="!showAll">You don't own any organizations yet. You may have access to organizations owned by others: enable <b>Show all</b> above to see them. You can also create a new organization.</p>
                <p v-else>You can create a new organization by clicking the create organization button.</p>
            </div>
            <div v-for="org in paginatedOrganizations" :key="org.slug"
                 class="org-card" style="cursor: pointer;" @click="viewOrganization(org)">
                <Card>
                    <template #content>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center gap-2">
                                    <i class="fa-solid fa-sitemap" />
                                    <strong class="org-name">{{ org.name ? org.name : org.slug }}</strong>
                                </div>
                                <div v-if="org.description" class="org-card-description mt-1">{{ org.description }}</div>
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
                                        title="Manage Members" @click.stop="openMembersDialog(org)" />
                                <Button v-if="!readyOnly && org.permissions?.canWrite && org.slug !== 'public'"
                                        severity="secondary" outlined size="small" :loading="org.editing"
                                        :disabled="org.editing || org.deleting" icon="fa-solid fa-pencil"
                                        @click.stop="handleEdit(org)" />
                                <Button v-if="!readyOnly && org.permissions?.canDelete && org.slug !== 'public'"
                                        severity="danger" size="small" :loading="org.deleting"
                                        :disabled="org.deleting || org.editing" icon="fa-solid fa-trash"
                                        @click.stop="handleDelete(org)" />
                            </div>
                        </div>
                    </template>
                </Card>
            </div>
        </div>

        <!-- Sticky paginator -->
        <div v-if="!loading" class="org-pagination">
            <Paginator :rows="Number(itemsPerPage)" :total-records="filteredOrganizations.length"
                       :first="(currentPage - 1) * itemsPerPage"
                       :rows-per-page-options="[5, 10, 25, 50, 100]" @page="onPageChange" />
        </div>

        <DeleteOrganizationDialog v-if="deleteDialogOpen" :org-slug="currentOrgSlug" @on-close="handleDeleteClose" />
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @on-close="handleMessageClose" />
        <OrganizationDialog v-if="orgDialogOpen" :mode="orgDialogMode" :model="orgDialogModel"
                            @on-close="handleOrganizationClose" />
        <OrganizationMembersDialog v-if="membersDialogOpen"
                                   :org-slug="selectedOrgForMembers.slug"
                                   :can-manage-members="selectedOrgForMembers.permissions?.canManageMembers || false"
                                   @on-close="closeMembersDialog" />

    </div>
</template>

<script>
import DeleteOrganizationDialog from './DeleteOrganizationDialog.vue';
import OrganizationDialog from './OrganizationDialog.vue';
import OrganizationMembersDialog from './OrganizationMembersDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import { setTitle } from '@/libs/utils';
import { getOrgPagePreferences, saveOrgPagePreferences } from '@/libs/storageUtils';
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

/**
 * Organizations - Admin panel for managing platform organizations.
 *
 * Lists all organizations in a paginated DataTable and provides dialogs
 * for creating, editing, and deleting organizations.
 */
export default {
    name: 'OrganizationsPage',
    components: {
        
        DeleteOrganizationDialog,
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

    data: function () {
        const prefs = getOrgPagePreferences();
        return {
            error: "",
            organizations: [],
            loading: true,
            deleteDialogOpen: false,
            currentOrgSlug: null,
            messageDialogOpen: false,
            currentMessage: null,
            userName: reg.getUsername(),
            isAdmin: false,

            orgDialogModel: null,
            orgDialogMode: null,
            orgDialogOpen: false,

            membersDialogOpen: false,
            selectedOrgForMembers: null,

            showAll: prefs?.ownedOnly === false,
            searchQuery: '',
            currentPage: prefs?.currentPage || 1,
            itemsPerPage: prefs?.itemsPerPage || 10
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
            if (!this.searchQuery) return this.organizations;
            const query = this.searchQuery.toLowerCase();
            return this.organizations.filter(org => {
                const name = (org.name || org.slug).toLowerCase();
                const slug = org.slug.toLowerCase();
                const description = (org.description || '').toLowerCase();
                const owner = (org.owner || '').toLowerCase();
                return name.includes(query) || slug.includes(query) || description.includes(query) || owner.includes(query);
            });
        },
        paginatedOrganizations() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            return this.filteredOrganizations.slice(start, start + this.itemsPerPage);
        }
    },
    watch: {
        showAll: async function () {
            this.currentPage = 1;
            this.savePreferences();
            await this.fetchOrganizations();
        },
        itemsPerPage: function () {
            this.currentPage = 1;
            this.savePreferences();
        },
        searchQuery: function () {
            this.currentPage = 1;
        }
    },
    mounted: async function () {
        setTitle("Organizations");
        await this.fetchOrganizations();
        const prefs = getOrgPagePreferences();
        if (prefs?.scrollTop) {
            this.$nextTick(() => {
                if (this.$refs.cardsArea) {
                    this.$refs.cardsArea.scrollTop = prefs.scrollTop;
                }
            });
        }
    },
    beforeUnmount() {
        this.savePreferences();
    },
    methods: {

        async fetchOrganizations() {
            this.loading = true;
            try {
                this.isAdmin = reg.isAdmin();

                let tmp = await reg.orgs.getOrganizations(!this.showAll);

                this.organizations = tmp.map(item => {
                    let org = item.org;
                    return {
                        slug: org.slug,
                        name: org.name,
                        editing: false,
                        deleting: false,
                        description: org.description,
                        creationDate: Date.parse(org.creationDate),
                        owner: org.owner,
                        isPublic: org.isPublic,
                        permissions: org.permissions
                    };
                });
            } catch (e) {
                // A 401 is handled by reg.onUnauthorized (end the session, sign in)
                if (!isUnauthorized(e)) this.$notify.error(e.message);
            }
            this.loading = false;
        },

        savePreferences() {
            saveOrgPagePreferences(this.itemsPerPage, !this.showAll, this.currentPage, this.$refs.cardsArea?.scrollTop ?? 0);
        },

        onPageChange(event) {
            this.currentPage = event.page + 1;
            this.itemsPerPage = event.rows;
            this.savePreferences();
        },

        handleDelete(org) {
            this.currentOrgSlug = org.slug;
            this.deleteDialogOpen = true;
        },

        async handleDeleteClose(res) {
            this.deleteDialogOpen = false;

            if (res == "close") {
                this.currentOrgSlug = null;
                return;
            }

            let org = this.organizations.find(o => o.slug == this.currentOrgSlug);
            org.deleting = true;

            try {

                let ret = await reg.orgs.deleteOrganization(this.currentOrgSlug);

                if (ret) {
                    this.organizations = this.organizations.filter(o => o.slug !== this.currentOrgSlug);
                    this.$notify.success('Organization deleted successfully', { summary: 'Organization Deleted' });
                } else {
                    this.$notify.error('Failed to delete organization "' + this.currentOrgSlug + '"');
                    console.error(ret);
                    org.deleting = false;
                }
            } catch (e) {
                console.error(e);
                this.$notify.error('Failed to delete organization: ' + e.message);
                org.deleting = false;
            }

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
                this.loading = true;

                try {
                    let ret = await reg.orgs.createOrganization({
                        slug: neworg.slug,
                        name: neworg.name,
                        description: neworg.description,
                        isPublic: neworg.isPublic
                    });
                    if (ret) {
                        this.organizations.push({
                            slug: neworg.slug,
                            name: neworg.name,
                            description: neworg.description,
                            isPublic: neworg.isPublic,
                            editing: false,
                            deleting: false,
                            owner: this.userName,
                            permissions: { canRead: true, canWrite: true, canDelete: true, canManageMembers: true }
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
                this.loading = false;

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

        viewOrganization(org) {
            this.$router.push({
                name: "Datasets", params: {
                    org: org.slug
                }
            });
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

        h1 {
            font-size: 1.75rem;
            line-height: 1.2;
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
        margin-bottom: var(--ddb-spacing-sm);

        .org-name {
            font-size: 1.25rem;
        }

        .org-card-description {
            color: var(--ddb-text-secondary);
            font-size: var(--ddb-font-size-sm);
        }

        .org-card-tags {
            flex-shrink: 0;
        }
    }

    /* Responsive */
    @media screen and (max-width: 767.98px) {
        .org-page-header {
            .org-header-layout {
                flex-direction: column;
                gap: var(--ddb-spacing-md);
            }

            .org-actions {
                width: 100%;
            }

            h1 {
                font-size: var(--ddb-font-size-lg);
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
