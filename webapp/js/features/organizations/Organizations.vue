<template>
    <div id="organizations">
        <Toast position="bottom-left" />

        <div class="org-page-header">
            <div class="org-header-layout">
                <div class="org-identity">
                    <div class="d-flex align-items-start gap-3">
                        <div class="org-icon-wrapper d-flex align-items-center justify-content-center">
                            <i class="fa-solid fa-sitemap"></i>
                        </div>
                        <div>
                            <div class="org-title-row">
                                <h1 class="my-0">Organizations</h1>
                                <Tag rounded severity="info" icon="fa-solid fa-layer-group">
                                    {{ organizations.length }} org{{ organizations.length !== 1 ? 's' : '' }}
                                </Tag>
                            </div>
                            <p class="org-description mt-1 mb-0">Organize your datasets into groups and manage team access.</p>
                        </div>
                    </div>
                </div>
                <div class="org-actions">
                    <Button v-if="!readyOnly" @click.stop="handleNew()" severity="primary" size="small" icon="fa-solid fa-plus" label="Create Organization" />
                </div>
            </div>
        </div>

        <!-- Skeleton loading state -->
        <div v-if="loading">
            <Card v-for="i in 4" :key="i" class="mb-3">
                <template #content>
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1 d-flex align-items-center">
                            <Skeleton shape="circle" size="1.5rem" class="me-3" />
                            <Skeleton width="12rem" height="1.25rem" />
                        </div>
                        <div class="me-3">
                            <Skeleton width="4.5rem" height="1.5rem" borderRadius="1rem" />
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
        <div v-else>
            <DataView :value="organizations" :paginator="organizations.length > 10" :rows="10" layout="list">
                <template #list="slotProps">
                    <div v-for="(org, index) in slotProps.items" :key="org.slug"
                         class="org-card" @click="viewOrganization(org)" style="cursor: pointer;">
                        <Card>
                            <template #content>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="flex-grow-1">
                                        <div class="d-flex align-items-center gap-2">
                                            <i class="fa-solid fa-sitemap"></i>
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
                                            @click.stop="openMembersDialog(org)" severity="secondary" outlined size="small"
                                            icon="fa-solid fa-users" title="Manage Members" />
                                        <Button v-if="!readyOnly && org.permissions?.canWrite && org.slug !== 'public'"
                                            @click.stop="handleEdit(org)" severity="secondary" outlined size="small"
                                            :loading="org.editing" :disabled="org.editing || org.deleting"
                                            icon="fa-solid fa-pencil" />
                                        <Button v-if="!readyOnly && org.permissions?.canDelete && org.slug !== 'public'"
                                            @click.stop="handleDelete(org)" severity="danger" size="small"
                                            :loading="org.deleting" :disabled="org.deleting || org.editing"
                                            icon="fa-solid fa-trash" />
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                </template>
                <template #empty>
                    <div class="text-center p-4">
                        <h3>No organizations found</h3>
                        <p>You can create a new organization by clicking the create organization button.</p>
                    </div>
                </template>
            </DataView>
        </div>

        <DeleteOrganizationDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :orgSlug="currentOrgSlug">
        </DeleteOrganizationDialog>
        <MessageDialog v-if="messageDialogOpen" :message="currentMessage" @onClose="handleMessageClose"></MessageDialog>
        <OrganizationDialog v-if="orgDialogOpen" :mode="orgDialogMode" :model="orgDialogModel"
            @onClose="handleOrganizationClose"></OrganizationDialog>
        <OrganizationMembersDialog v-if="membersDialogOpen"
            :orgSlug="selectedOrgForMembers.slug"
            :canManageMembers="selectedOrgForMembers.permissions?.canManageMembers || false"
            @onClose="closeMembersDialog">
        </OrganizationMembersDialog>

    </div>
</template>

<script>
import Message from '@/components/Message.vue';
import DeleteOrganizationDialog from './DeleteOrganizationDialog.vue';
import OrganizationDialog from './OrganizationDialog.vue';
import OrganizationMembersDialog from './OrganizationMembersDialog.vue';
import MessageDialog from '@/features/dataset/dialogs/MessageDialog.vue';
import { setTitle } from '@/libs/utils';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Toast from 'primevue/toast';
import DataView from 'primevue/dataview';
import Skeleton from 'primevue/skeleton';

export default {
    components: {
        Message,
        DeleteOrganizationDialog,
        MessageDialog,
        OrganizationDialog,
        OrganizationMembersDialog,
        Button,
        Card,
        Tag,
        Toast,
        DataView,
        Skeleton
    },

    data: function () {
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
            selectedOrgForMembers: null
        }
    },
    mounted: async function () {
        setTitle("Organizations");

        try {
            this.isAdmin = reg.isAdmin();

            let tmp = await reg.getOrganizations()

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

            if (this.organizations.length === 0) {
                this.$router.push({ name: "Upload" }).catch(() => {
                });
            }
        } catch (e) {
            if (e.status === 401) {
                if (e.noRetry) {
                    reg.logout(); // Clear JWT token and related data
                    this.$router.push({ name: "Login" }).catch(() => { });
                } else {
                    this.error = "Temporary authentication issue. Please try again.";
                }
            } else {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 });
            }

        }
        this.loading = false;
    },
    methods: {

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

                let ret = await reg.deleteOrganization(this.currentOrgSlug);

                if (ret) {
                    this.organizations = this.organizations.filter(o => o.slug !== this.currentOrgSlug);
                    this.$toast.add({ severity: 'success', summary: 'Organization Deleted', detail: 'Organization deleted successfully', life: 3000 });
                } else {
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete organization "' + this.currentOrgSlug + '"', life: 5000 });
                    console.error(ret);
                    org.deleting = false;
                }
            } catch (e) {
                console.error(e);
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete organization: ' + e.message, life: 5000 });
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
                    let ret = await reg.createOrganization({
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
                        this.$toast.add({ severity: 'success', summary: 'Organization Created', detail: 'Organization created successfully', life: 3000 });
                    } else {
                        this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create organization "' + neworg.slug + '"', life: 5000 });
                        console.error(ret);
                    }
                } catch (e) {
                    console.error(e);
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create organization: ' + e.message, life: 5000 });
                }
                this.loading = false;

            } else if (this.orgDialogMode == "edit") {
                let org = this.orgDialogModel;
                if (!org) return;
                this.orgDialogModel = null;
                this.orgDialogOpen = false;
                this.loading = true;

                try {
                    let ret = await reg.updateOrganization(org.slug, neworg.name, neworg.description, neworg.isPublic);
                    if (ret) {
                        let orgitem = this.organizations.find(o => o.slug == org.slug);
                        orgitem.slug = org.slug;
                        orgitem.name = neworg.name;
                        orgitem.description = neworg.description;
                        orgitem.isPublic = neworg.isPublic;
                        this.$toast.add({ severity: 'success', summary: 'Organization Updated', detail: 'Organization updated successfully', life: 3000 });
                    } else {
                        this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update organization "' + org.slug + '"', life: 5000 });
                        console.error(ret);
                    }
                } catch (e) {
                    console.error(e);
                    this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update organization: ' + e.message, life: 5000 });
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
    },

    computed: {
        readyOnly: function () {
            return HubOptions.readOnlyOrgs;
        },
        memberManagementEnabled() {
            return reg.getFeature(Features.ORGANIZATION_MEMBER_MANAGEMENT);
        }
    }
}
</script>

<style scoped>
#organizations {
    margin: 0.75rem;

    .org-page-header {
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
            align-items: flex-start;
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
                display: none;
            }

            .org-card-actions {
                flex-direction: column;
            }
        }
    }
}
</style>
