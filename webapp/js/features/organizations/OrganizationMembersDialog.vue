<template>
    <div>
        <Window id="organizationMembersDialog" title="Manage Members" modal width="43.75rem" fixed-size @close="$emit('close')">
            <div class="members-dialog">
                <!-- Loading state -->
                <div v-if="loading" class="ui active centered inline loader" />

                <!-- Error message -->
                <PrimeMessage v-if="error" severity="error" @close="error = null">
                    <strong>Error</strong>: {{ error }}
                </PrimeMessage>

                <!-- Feature disabled message -->
                <PrimeMessage v-if="!featureEnabled" severity="info" :closable="false">
                    <strong>Feature Disabled</strong>
                    <p>Organization member management is disabled on this server.</p>
                </PrimeMessage>

                <!-- Members list -->
                <div v-if="featureEnabled">
                    <!-- Add member section -->
                    <div v-if="canManageMembers" class="mb-3">
                        <h3>Add Member</h3>
                        <div class="d-flex gap-3 flex-wrap align-items-end">
                            <div style="flex: 7 1 12rem;">
                                <label id="organization-members-dialog-user-label" for="organization-members-dialog-user" class="d-block mb-1 fw-semibold">User</label>
                                <Select v-model="newMember.userName" input-id="organization-members-dialog-user" aria-labelledby="organization-members-dialog-user-label" :options="availableUsers" option-label="displayName" option-value="userName" filter placeholder="Search user..." class="w-100" />
                            </div>
                            <div style="flex: 5 1 9rem;">
                                <label id="organization-members-dialog-permissions-label" for="organization-members-dialog-permissions" class="d-block mb-1 fw-semibold">Permissions</label>
                                <Select v-model="newMember.permissions" input-id="organization-members-dialog-permissions" aria-labelledby="organization-members-dialog-permissions-label" :options="permissionsOptions" option-label="label" option-value="value" class="w-100" />
                            </div>
                            <div style="flex: 0 0 auto;">
                                <span class="d-block mb-1" aria-hidden="true">&nbsp;</span>
                                <Button :disabled="!newMember.userName || addingMember" icon="fa-solid fa-plus" label="Add" @click="addMember" />
                            </div>
                        </div>
                    </div>

                    <!-- Current members table -->
                    <h3>Current Members</h3>
                    <table v-if="members.length > 0" class="ui celled table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th :class="showFrom('sm')">Email</th>
                                <th>Permissions</th>
                                <th :class="showFrom('sm')">Granted</th>
                                <th v-if="canManageMembers">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="member in members" :key="member.userName">
                                <td>{{ member.userName }}</td>
                                <td :class="showFrom('sm')">{{ member.email }}</td>
                                <td>
                                    <Select v-if="canManageMembers"
                                            v-model="member.permissions"
                                            :aria-label="`Permissions of ${member.userName}`"
                                            :options="permissionsOptions"
                                            option-label="label"
                                            option-value="value"
                                            class="w-full"
                                            @change="updatePermission(member)" />
                                    <span v-else>{{ member.permissionName }}</span>
                                </td>
                                <td :class="showFrom('sm')">
                                    <span v-if="member.grantedAt">
                                        {{ formatDate(member.grantedAt) }}
                                        <span v-if="member.grantedBy"> by {{ member.grantedBy }}</span>
                                    </span>
                                    <span v-else>-</span>
                                </td>
                                <td v-if="canManageMembers">
                                    <Button severity="danger" size="small" :disabled="removingMember === member.userName" icon="fa-solid fa-trash" label="Remove" @click="removeMember(member)" />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-else>
                        <PrimeMessage severity="info" :closable="false">
                            No members in this organization yet.
                        </PrimeMessage>
                    </div>
                </div>

                <!-- Footer -->
                <div class="d-flex flex-wrap justify-content-end gap-2 mt-4">
                    <Button severity="secondary" label="Close" @click="$emit('close')" />
                </div>
            </div>

            <ConfirmDialog v-if="removeMemberDialogOpen"
                           title="Remove Member"
                           :message="`Are you sure you want to remove <strong>${memberToRemove ? memberToRemove.userName : ''}</strong> from this organization?`"
                           confirm-text="Remove"
                           cancel-text="Cancel"
                           confirm-button-class="danger"
                           @close="handleRemoveMemberDialogClose" />
        </Window>
    </div>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { formatDate } from '@/libs/format';
import { showFrom } from '@/libs/responsiveColumns';

export default {
    components: { Window, ConfirmDialog, Select, Button, PrimeMessage },

    props: {
        orgSlug: { type: String, required: true },
        canManageMembers: { type: Boolean, default: false }
    },
    emits: ['close'],
    setup() {
        return { showFrom };
    },

    data() {
        return {
            loading: true,
            error: null,
            featureEnabled: false,
            members: [],
            allUsers: [],
            addingMember: false,
            removingMember: null,
            newMember: {
                userName: '',
                permissions: 1 // Default to ReadWrite
            },
            removeMemberDialogOpen: false,
            memberToRemove: null,
            permissionsOptions: [
                { value: 0, label: 'Read Only' },
                { value: 1, label: 'Read/Write' },
                { value: 2, label: 'Read/Write/Delete' },
                { value: 3, label: 'Admin' }
            ]
        };
    },

    computed: {
        availableUsers() {
            const memberUserNames = this.members.map(m => m.userName);
            return this.allUsers
                .filter(u => !memberUserNames.includes(u.userName))
                .map(u => ({ ...u, displayName: `${u.userName} (${u.email})` }));
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
                // Check if feature is enabled
                this.featureEnabled = reg.features.get(Features.ORGANIZATION_MEMBER_MANAGEMENT);

                if (!this.featureEnabled) {
                    this.loading = false;
                    return;
                }

                // Load members
                this.members = await reg.orgs.getOrganizationMembers(this.orgSlug);

                // Load all users if can manage (for adding new members)
                if (this.canManageMembers) {
                    this.allUsers = await reg.admin.users();
                }

            } catch (e) {
                this.error = e.message || 'Failed to load members';
                console.error('Failed to load organization members:', e);
            } finally {
                this.loading = false;
            }
        },

        async addMember() {
            if (!this.newMember.userName) return;

            this.addingMember = true;
            try {
                await reg.orgs.addOrganizationMember(
                    this.orgSlug,
                    this.newMember.userName,
                    this.newMember.permissions
                );

                // Refresh members list
                await this.loadData();

                // Reset form
                this.newMember.userName = '';
                this.newMember.permissions = 1;

                this.$notify.success('Member added successfully', { summary: 'Member Added' });

            } catch (e) {
                this.error = e.message || 'Failed to add member';
            } finally {
                this.addingMember = false;
            }
        },

        async updatePermission(member) {
            try {
                await reg.orgs.updateMemberPermissions(
                    this.orgSlug,
                    member.userName,
                    member.permissions
                );
                this.$notify.success('Permissions saved successfully', { summary: 'Permissions Updated' });
            } catch (e) {
                this.error = e.message || 'Failed to update permissions';
                // Reload to get correct state
                await this.loadData();
            }
        },

        removeMember(member) {
            this.memberToRemove = member;
            this.removeMemberDialogOpen = true;
        },

        async handleRemoveMemberDialogClose(action) {
            this.removeMemberDialogOpen = false;

            if (action !== 'confirm' || !this.memberToRemove) {
                this.memberToRemove = null;
                return;
            }

            this.removingMember = this.memberToRemove.userName;
            try {
                await reg.orgs.removeOrganizationMember(this.orgSlug, this.memberToRemove.userName);
                await this.loadData();
                this.$notify.success('Member removed successfully', { summary: 'Member Removed' });
            } catch (e) {
                this.error = e.message || 'Failed to remove member';
            } finally {
                this.removingMember = null;
                this.memberToRemove = null;
            }
        },

        formatDate,

    }
};
</script>

<style scoped>

table.ui.celled.table {
    margin-top: 0.5rem;
}
</style>
