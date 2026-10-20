<template>
    <Window id="organizationsDialog" title="Manage User Organizations" modal size-class="dialog-xl" fixed-size @close="close">
        <div class="organizations-dialog">
            <!-- Loading state -->
            <div v-if="loading" class="ui active centered inline loader" />

            <!-- Error message -->
            <PrimeMessage v-if="error" severity="error" @close="error = null">
                <strong>Error</strong>: {{ error }}
            </PrimeMessage>

            <PrimeMessage severity="info" :closable="false">
                Managing organizations for user: <strong>{{ user.userName }}</strong>
            </PrimeMessage>

            <!-- Add organization section -->
            <div v-if="!loading" class="add-org-section">
                <h4>Add Organization</h4>
                <div class="d-flex gap-3 flex-wrap align-items-end">
                    <div class="flex-grow-1" style="min-width: 12rem;">
                        <label id="organizations-dialog-organization-label" for="organizations-dialog-organization" class="d-block mb-1 fw-semibold">Organization</label>
                        <Select v-model="newOrg.slug" input-id="organizations-dialog-organization" aria-labelledby="organizations-dialog-organization-label" :options="availableOrganizations" option-label="displayName" option-value="slug" filter placeholder="Search organization..." class="w-100" />
                    </div>
                    <div style="min-width: 10rem;">
                        <label id="organizations-dialog-permissions-label" for="organizations-dialog-permissions" class="d-block mb-1 fw-semibold">Permissions</label>
                        <Select v-model="newOrg.permissions" input-id="organizations-dialog-permissions" aria-labelledby="organizations-dialog-permissions-label" :options="permissionsOptions" option-label="label" option-value="value" class="w-100" />
                    </div>
                    <div>
                        <Button severity="primary" :disabled="!newOrg.slug || addingOrg" icon="fa-solid fa-plus" label="Add" @click="addOrganization" />
                    </div>
                </div>
            </div>

            <Divider v-if="!loading" />

            <!-- User organizations table -->
            <h4 v-if="!loading">User Organizations</h4>
            <table v-if="!loading && userOrganizations.length > 0" class="ui celled table">
                <thead>
                    <tr>
                        <th>Organization</th>
                        <th>Permissions</th>
                        <th>Granted</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="org in userOrganizations" :key="org.slug">
                        <td>
                            {{ org.name || org.slug }}
                            <Tag v-if="org.isOwner" severity="warn" value="Owner" class="ms-1" />
                        </td>
                        <td>
                            <Select v-if="!org.isOwner"
                                    v-model="org.permissions"
                                    :aria-label="`Permissions in ${org.name || org.slug}`"
                                    :options="permissionsOptions"
                                    option-label="label"
                                    option-value="value"
                                    class="w-full"
                                    @change="updatePermission(org)" />
                            <Tag v-else severity="info" value="Full Access" />
                        </td>
                        <td>
                            <span v-if="org.grantedAt">
                                {{ formatDate(org.grantedAt) }}
                                <span v-if="org.grantedBy"> by {{ org.grantedBy }}</span>
                            </span>
                            <span v-else-if="org.isOwner">-</span>
                            <span v-else>-</span>
                        </td>
                        <td>
                            <Button v-if="!org.isOwner"
                                    severity="danger" size="small"
                                    :disabled="removingOrg === org.slug"
                                    icon="fa-solid fa-trash"
                                    label="Remove" @click="confirmRemoveOrganization(org)" />
                            <span v-else>-</span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div v-else-if="!loading">
                <PrimeMessage severity="info" :closable="false">
                    This user is not a member of any organization.
                </PrimeMessage>
            </div>

            <!-- Footer -->
            <div class="buttons">
                <Button severity="secondary" label="Close" @click="close" />
            </div>
        </div>

        <ConfirmDialog v-if="removeOrgDialogOpen"
                       title="Remove from Organization"
                       :message="`Are you sure you want to remove <strong>${user.userName}</strong> from organization <strong>${orgToRemove ? (orgToRemove.name || orgToRemove.slug) : ''}</strong>?`"
                       confirm-text="Remove"
                       cancel-text="Cancel"
                       confirm-button-class="danger"
                       @close="handleRemoveOrgDialogClose" />
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import reg from '@/libs/api/sharedRegistry';
import { formatDate } from '@/libs/format';

export default {
    components: { Window, ConfirmDialog, Select, Button, PrimeMessage, Divider, Tag },

    props: {
        user: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],

    data() {
        return {
            loading: true,
            error: null,
            userOrganizations: [],
            allOrganizations: [],
            addingOrg: false,
            removingOrg: null,
            hasChanges: false,
            newOrg: {
                slug: '',
                permissions: 1 // Default to ReadWrite
            },
            removeOrgDialogOpen: false,
            orgToRemove: null,
            permissionsOptions: [
                { value: 0, label: 'Read Only' },
                { value: 1, label: 'Read/Write' },
                { value: 2, label: 'Read/Write/Delete' },
                { value: 3, label: 'Admin' }
            ]
        };
    },

    computed: {
        availableOrganizations() {
            const userOrgSlugs = this.userOrganizations.map(o => o.slug.toLowerCase());
            return this.allOrganizations
                .filter(o =>
                    o.slug.toLowerCase() !== 'public' &&
                    !userOrgSlugs.includes(o.slug.toLowerCase())
                )
                .map(o => ({ ...o, displayName: o.name || o.slug }));
        }
    },

    async mounted() {
        await this.loadData();
    },

    methods: {
        async loadData() {
            this.loading = true;
            this.error = null;

            try {
                const [userOrgs, allOrgsInstances] = await Promise.all([
                    reg.admin.getUserOrganizations(this.user.userName),
                    reg.orgs.getOrganizations()
                ]);

                // Extract org data from Organization instances
                this.allOrganizations = allOrgsInstances.map(instance => instance.org);

                // Filter out "Public" organization
                this.userOrganizations = userOrgs.filter(org => org.slug.toLowerCase() !== 'public');

            } catch (e) {
                this.error = e.message || 'Failed to load organizations';
                console.error('Failed to load user organizations:', e);
            } finally {
                this.loading = false;
            }
        },

        async addOrganization() {
            if (!this.newOrg.slug) return;

            this.addingOrg = true;
            try {
                await reg.admin.addUserToOrganization(
                    this.user.userName,
                    this.newOrg.slug,
                    this.newOrg.permissions
                );

                this.$notify.success(`User added to organization successfully`, { summary: 'Organization Added' });
                this.hasChanges = true;

                // Refresh organizations list
                await this.loadData();

                // Reset form
                this.newOrg.slug = '';
                this.newOrg.permissions = 1;

            } catch (e) {
                this.$notify.error(e.message || 'Failed to add organization');
                this.error = e.message || 'Failed to add organization';
            } finally {
                this.addingOrg = false;
            }
        },

        async updatePermission(org) {
            try {
                await reg.admin.updateUserOrganizationPermissions(
                    this.user.userName,
                    org.slug,
                    org.permissions
                );
                this.$notify.success(`Permissions updated for organization "${org.name || org.slug}"`, { summary: 'Permissions Updated' });
            } catch (e) {
                this.$notify.error(e.message || 'Failed to update permissions');
                this.error = e.message || 'Failed to update permissions';
                // Reload to get correct state
                await this.loadData();
            }
        },

        confirmRemoveOrganization(org) {
            this.orgToRemove = org;
            this.removeOrgDialogOpen = true;
        },

        async handleRemoveOrgDialogClose(action) {
            this.removeOrgDialogOpen = false;

            if (action !== 'confirm' || !this.orgToRemove) {
                this.orgToRemove = null;
                return;
            }

            this.removingOrg = this.orgToRemove.slug;
            try {
                await reg.admin.removeUserFromOrganization(this.user.userName, this.orgToRemove.slug);
                this.$notify.success(`User removed from organization successfully`, { summary: 'Organization Removed' });
                this.hasChanges = true;
                await this.loadData();
            } catch (e) {
                this.$notify.error(e.message || 'Failed to remove from organization');
                this.error = e.message || 'Failed to remove from organization';
            } finally {
                this.removingOrg = null;
                this.orgToRemove = null;
            }
        },

        formatDate,

        close() {
            this.$emit('close', this.hasChanges ? 'updated' : null);
        }
    }
};
</script>

<style scoped>
.organizations-dialog {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.add-org-section {
    margin-bottom: 1rem;
}

.buttons {
    margin-top: 1.5rem;
    text-align: right;
}

table.ui.celled.table {
    margin-top: 0.5rem;
}
</style>
