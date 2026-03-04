<template>
    <div id="organizations">
        <Toast position="bottom-left" />

        <div class="top-banner d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-3">
                <i class="fa-solid fa-sitemap org-icon"></i>
                <div>
                    <h1 class="mb-0">Organizations</h1>
                    <p class="text-muted mb-0 mt-1">Organize your datasets into groups and manage team access.</p>
                </div>
            </div>
            <Button v-if="!readyOnly" @click.stop="handleNew()" severity="info" size="small">
                <i class="fa-solid fa-plus"></i> Create Organization
            </Button>
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
                                        <i class="fa-solid fa-sitemap me-3"></i>
                                        <strong style="font-size: large;">{{ org.name ? org.name : org.slug }}</strong>
                                    </div>
                                    <div class="me-3">
                                        <Tag v-if="org.isPublic" severity="success" icon="fa-solid fa-unlock">Public</Tag>
                                        <Tag v-else severity="warn" icon="fa-solid fa-lock">Private</Tag>
                                    </div>
                                    <div class="org-actions d-flex gap-1">
                                        <Button v-if="memberManagementEnabled && !readyOnly && (org.owner === userName || isAdmin)"
                                            @click.stop="openMembersDialog(org)" severity="info" size="small"
                                            icon="fa-solid fa-users" title="Manage Members" />
                                        <Button v-if="!readyOnly && org.slug !== 'public' && org.slug !== org.owner"
                                            @click.stop="handleEdit(org)" severity="secondary" outlined size="small"
                                            :loading="org.editing" :disabled="org.editing || org.deleting"
                                            icon="fa-solid fa-pencil" />
                                        <Button v-if="!readyOnly && org.slug !== 'public' && org.slug !== org.owner"
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
            :isOwner="selectedOrgForMembers.owner === userName"
            :isAdmin="isAdmin"
            @onClose="closeMembersDialog">
        </OrganizationMembersDialog>

    </div>
</template>

<script>
import Message from '../Message.vue';
import DeleteOrganizationDialog from './DeleteOrganizationDialog.vue';
import OrganizationDialog from './OrganizationDialog.vue';
import OrganizationMembersDialog from './OrganizationMembersDialog.vue';
import MessageDialog from '../common/MessageDialog.vue';
import { setTitle } from '../../libs/utils';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';
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
            // Check if current user is admin
            try {
                const userInfo = await reg.info();
                this.isAdmin = userInfo?.roles?.includes('admin') || false;
            } catch (e) {
                this.isAdmin = false;
            }

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
                    isPublic: org.isPublic
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
                            isPublic: neworg.isPublic
                        });
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

    .org-card {
        margin-bottom: 1rem;
    }

    .top-banner {
        margin-top: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .org-icon {
        font-size: 1.5rem;
        color: var(--ddb-text-secondary);
    }

    h1 {
        font-size: 1.75rem;
        line-height: 1.2;
    }

    margin: 0.75rem;

    .organization {

        .segment {
            &:hover {
                background-color: var(--ddb-bg-secondary);
                cursor: pointer;
            }
        }

        .column {
            font-size: large;
        }

        i.icon {
            margin-right: 0.3125rem;
        }

        .main-col {
            font-weight: bold;

            i.icon {
                margin-right: 1.25rem;
            }
        }

        .item {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    }
}
</style>
