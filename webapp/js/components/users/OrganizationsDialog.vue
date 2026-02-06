<template>
    <Window title="Manage User Organizations" id="organizationsDialog" @onClose="close" modal width="750px" fixedSize>
        <div class="organizations-dialog">
            <!-- Loading state -->
            <div v-if="loading" class="ui active centered inline loader"></div>

            <!-- Error message -->
            <div v-if="error" class="ui negative message">
                <i class="close icon" @click="error = null"></i>
                <div class="header">Error</div>
                <p>{{ error }}</p>
            </div>

            <div class="ui message info">
                <p>Managing organizations for user: <strong>{{ user.userName }}</strong></p>
            </div>

            <!-- Add organization section -->
            <div class="add-org-section" v-if="!loading">
                <h4>Add Organization</h4>
                <div class="ui form">
                    <div class="fields">
                        <div class="seven wide field">
                            <label>Organization</label>
                            <div class="ui search selection dropdown" ref="orgDropdown">
                                <input type="hidden" name="orgSlug" v-model="newOrg.slug">
                                <i class="dropdown icon"></i>
                                <input class="search" autocomplete="off" tabindex="0">
                                <div class="default text">Search organization...</div>
                                <div class="menu">
                                    <div class="item" v-for="org in availableOrganizations" :key="org.slug" :data-value="org.slug">
                                        <i class="building icon"></i>{{ org.name || org.slug }}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="five wide field">
                            <label>Permissions</label>
                            <select v-model="newOrg.permissions" ref="addPermDropdown" class="ui selection dropdown">
                                <option v-for="perm in permissionsOptions" :key="perm.value" :value="perm.value">
                                    {{ perm.label }}
                                </option>
                            </select>
                        </div>
                        <div class="four wide field">
                            <label>&nbsp;</label>
                            <button class="ui primary button" @click="addOrganization" :disabled="!newOrg.slug || addingOrg">
                                <i class="plus icon"></i>&nbsp;Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ui divider" v-if="!loading"></div>

            <!-- User organizations table -->
            <h4 v-if="!loading">User Organizations</h4>
            <table class="ui celled table" v-if="!loading && userOrganizations.length > 0">
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
                            <span v-if="org.isOwner" class="ui tiny yellow label">Owner</span>
                        </td>
                        <td>
                            <select v-if="!org.isOwner"
                                    v-model="org.permissions"
                                    @change="updatePermission(org)"
                                    class="ui selection dropdown">
                                <option v-for="perm in permissionsOptions" :key="perm.value" :value="perm.value">
                                    {{ perm.label }}
                                </option>
                            </select>
                            <span v-else class="ui label">Full Access</span>
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
                            <button v-if="!org.isOwner"
                                    class="ui red mini button"
                                    @click="confirmRemoveOrganization(org)"
                                    :disabled="removingOrg === org.slug">
                                <i class="trash icon"></i> Remove
                            </button>
                            <span v-else class="ui tiny label">Cannot remove</span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div v-else-if="!loading" class="ui message">
                <p>This user is not a member of any organization.</p>
            </div>

            <!-- Footer -->
            <div class="buttons">
                <button @click="close" class="ui button">Close</button>
            </div>
        </div>

        <ConfirmDialog v-if="removeOrgDialogOpen"
            title="Remove from Organization"
            :message="`Are you sure you want to remove <strong>${user.userName}</strong> from organization <strong>${orgToRemove ? (orgToRemove.name || orgToRemove.slug) : ''}</strong>?`"
            confirmText="Remove"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleRemoveOrgDialogClose">
        </ConfirmDialog>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import reg from '../../libs/sharedRegistry';

export default {
    components: { Window, ConfirmDialog },

    props: {
        user: {
            type: Object,
            required: true
        }
    },

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
            return this.allOrganizations.filter(o =>
                o.slug.toLowerCase() !== 'public' &&
                !userOrgSlugs.includes(o.slug.toLowerCase())
            );
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
                    reg.getUserOrganizations(this.user.userName),
                    reg.getOrganizations()
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
                this.$nextTick(() => {
                    this.initOrgDropdown();
                    this.initPermDropdowns();
                });
            }
        },

        initOrgDropdown() {
            if (!this.$refs.orgDropdown) return;

            $(this.$refs.orgDropdown).dropdown({
                fullTextSearch: true,
                match: 'text',
                onChange: (value) => {
                    this.newOrg.slug = value;
                }
            });
        },

        initPermDropdowns() {
            $(this.$el).find('select.ui.selection.dropdown').dropdown();
        },

        async addOrganization() {
            if (!this.newOrg.slug) return;

            this.addingOrg = true;
            try {
                await reg.addUserToOrganization(
                    this.user.userName,
                    this.newOrg.slug,
                    this.newOrg.permissions
                );

                this.hasChanges = true;

                // Refresh organizations list
                await this.loadData();

                // Reset form
                this.newOrg.slug = '';
                this.newOrg.permissions = 1;

                // Clear dropdown selection
                this.$nextTick(() => {
                    if (this.$refs.orgDropdown) {
                        $(this.$refs.orgDropdown).dropdown('clear');
                    }
                    if (this.$refs.addPermDropdown) {
                        $(this.$refs.addPermDropdown).dropdown('set selected', '1');
                    }
                });

            } catch (e) {
                this.error = e.message || 'Failed to add organization';
            } finally {
                this.addingOrg = false;
            }
        },

        async updatePermission(org) {
            try {
                await reg.updateUserOrganizationPermissions(
                    this.user.userName,
                    org.slug,
                    org.permissions
                );
            } catch (e) {
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
                await reg.removeUserFromOrganization(this.user.userName, this.orgToRemove.slug);
                this.hasChanges = true;
                await this.loadData();
            } catch (e) {
                this.error = e.message || 'Failed to remove from organization';
            } finally {
                this.removingOrg = null;
                this.orgToRemove = null;
            }
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        },

        close() {
            this.$emit('onClose', this.hasChanges ? 'updated' : null);
        }
    }
};
</script>

<style scoped>
.organizations-dialog {
    padding: 1em;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.add-org-section {
    margin-bottom: 1em;
}

.buttons {
    margin-top: 1.5em;
    text-align: right;
}

table.ui.celled.table {
    margin-top: 0.5em;
}

>>> .ui.selection.dropdown {
    cursor: pointer !important;
}

>>> .ui.selection.dropdown .menu > .item {
    cursor: pointer !important;
}
</style>
