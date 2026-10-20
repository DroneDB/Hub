<template>
    <div>
        <Toast position="bottom-left" />
        <Window id="organizationMembersDialog" title="Manage Members" modal width="43.75rem" fixed-size @on-close="close">
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
                            <div style="flex: 7;">
                                <label class="d-block mb-1 fw-semibold">User</label>
                                <Select v-model="newMember.userName" :options="availableUsers" option-label="displayName" option-value="userName" filter placeholder="Search user..." class="w-100" />
                            </div>
                            <div style="flex: 5;">
                                <label class="d-block mb-1 fw-semibold">Permissions</label>
                                <Select v-model="newMember.permissions" :options="permissionsOptions" option-label="label" option-value="value" class="w-100" />
                            </div>
                            <div style="flex: 4;">
                                <label class="d-block mb-1">&nbsp;</label>
                                <Button severity="info" :disabled="!newMember.userName || addingMember" icon="fa-solid fa-plus" label="Add" @click="addMember" />
                            </div>
                        </div>
                    </div>

                    <!-- Current members table -->
                    <h3>Current Members</h3>
                    <table v-if="members.length > 0" class="ui celled table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Permissions</th>
                                <th>Granted</th>
                                <th v-if="canManageMembers">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="member in members" :key="member.userName">
                                <td>{{ member.userName }}</td>
                                <td>{{ member.email }}</td>
                                <td>
                                    <Select v-if="canManageMembers"
                                            v-model="member.permissions"
                                            :options="permissionsOptions"
                                            option-label="label"
                                            option-value="value"
                                            class="w-full"
                                            @change="updatePermission(member)" />
                                    <span v-else>{{ member.permissionName }}</span>
                                </td>
                                <td>
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
                <div class="d-flex justify-content-end gap-2 mt-4">
                    <Button severity="secondary" label="Close" @click="close" />
                </div>
            </div>

            <ConfirmDialog v-if="removeMemberDialogOpen"
                           title="Remove Member"
                           :message="`Are you sure you want to remove <strong>${memberToRemove ? memberToRemove.userName : ''}</strong> from this organization?`"
                           confirm-text="Remove"
                           cancel-text="Cancel"
                           confirm-button-class="danger"
                           @on-close="handleRemoveMemberDialogClose" />
        </Window>
    </div>
</template>

<script>
import Window from '@/components/Window.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Toast from 'primevue/toast';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { formatDate } from '@/libs/format';

export default {
    components: { Window, ConfirmDialog, Select, Button, PrimeMessage, Toast },

    props: {
        orgSlug: { type: String, required: true },
        canManageMembers: { type: Boolean, default: false }
    },
    emits: ['onClose'],

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
                this.featureEnabled = reg.getFeature(Features.ORGANIZATION_MEMBER_MANAGEMENT);

                if (!this.featureEnabled) {
                    this.loading = false;
                    return;
                }

                // Load members
                this.members = await reg.getOrganizationMembers(this.orgSlug);

                // Load all users if can manage (for adding new members)
                if (this.canManageMembers) {
                    this.allUsers = await reg.users();
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
                await reg.addOrganizationMember(
                    this.orgSlug,
                    this.newMember.userName,
                    this.newMember.permissions
                );

                // Refresh members list
                await this.loadData();

                // Reset form
                this.newMember.userName = '';
                this.newMember.permissions = 1;

                this.$toast.add({ severity: 'success', summary: 'Member Added', detail: 'Member added successfully', life: 3000 });

            } catch (e) {
                this.error = e.message || 'Failed to add member';
            } finally {
                this.addingMember = false;
            }
        },

        async updatePermission(member) {
            try {
                await reg.updateMemberPermissions(
                    this.orgSlug,
                    member.userName,
                    member.permissions
                );
                this.$toast.add({ severity: 'success', summary: 'Permissions Updated', detail: 'Permissions saved successfully', life: 3000 });
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
                await reg.removeOrganizationMember(this.orgSlug, this.memberToRemove.userName);
                await this.loadData();
                this.$toast.add({ severity: 'success', summary: 'Member Removed', detail: 'Member removed successfully', life: 3000 });
            } catch (e) {
                this.error = e.message || 'Failed to remove member';
            } finally {
                this.removingMember = null;
                this.memberToRemove = null;
            }
        },

        formatDate,

        close() {
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>

.add-member-section {
    margin-bottom: 1rem;
}

table.ui.celled.table {
    margin-top: 0.5rem;
}
</style>
