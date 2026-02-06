<template>
    <Window title="Manage Members" id="organizationMembersDialog" @onClose="close" modal width="700px" fixedSize >
        <div class="members-dialog">
            <!-- Loading state -->
            <div v-if="loading" class="ui active centered inline loader"></div>

            <!-- Error message -->
            <div v-if="error" class="ui negative message">
                <i class="close icon" @click="error = null"></i>
                <div class="header">Error</div>
                <p>{{ error }}</p>
            </div>

            <!-- Feature disabled message -->
            <div v-if="!featureEnabled" class="ui info message">
                <div class="header">Feature Disabled</div>
                <p>Organization member management is disabled on this server.</p>
            </div>

            <!-- Members list -->
            <div v-if="featureEnabled">
                <!-- Add member section -->
                <div class="add-member-section" v-if="canManageMembers">
                    <h4>Add Member</h4>
                    <div class="ui form">
                        <div class="fields">
                            <div class="seven wide field">
                                <label>User</label>
                                <div class="ui search selection dropdown" ref="userDropdown">
                                    <input type="hidden" name="userName" v-model="newMember.userName">
                                    <i class="dropdown icon"></i>
                                    <input class="search" autocomplete="off" tabindex="0">
                                    <div class="default text">Search user...</div>
                                    <div class="menu">
                                        <div class="item" v-for="user in availableUsers" :key="user.userName" :data-value="user.userName">
                                            <i class="user icon"></i>{{ user.userName }} ({{ user.email }})
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="five wide field">
                                <label>Permissions</label>
                                <select v-model="newMember.permissions" ref="addPermDropdown" class="ui selection dropdown">
                                    <option v-for="perm in permissionsOptions" :key="perm.value" :value="perm.value">
                                        {{ perm.label }}
                                    </option>
                                </select>
                            </div>
                            <div class="four wide field">
                                <label>&nbsp;</label>
                                <button class="ui primary button" @click="addMember" :disabled="!newMember.userName || addingMember">
                                    <i class="plus icon"></i>&nbsp;Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Current members table -->
                <h4>Current Members</h4>
                <table class="ui celled table" v-if="members.length > 0">
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
                                <select v-if="canManageMembers"
                                        v-model="member.permissions"
                                        @change="updatePermission(member)"
                                        class="ui selection dropdown">
                                    <option v-for="perm in permissionsOptions" :key="perm.value" :value="perm.value">
                                        {{ perm.label }}
                                    </option>
                                </select>
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
                                <button class="ui red mini button" @click="removeMember(member)" :disabled="removingMember === member.userName">
                                    <i class="trash icon"></i> Remove
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-else class="ui message">
                    <p>No members in this organization yet.</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="buttons">
                <button @click="close" class="ui button">Close</button>
            </div>
        </div>

        <ConfirmDialog v-if="removeMemberDialogOpen"
            title="Remove Member"
            :message="`Are you sure you want to remove <strong>${memberToRemove ? memberToRemove.userName : ''}</strong> from this organization?`"
            confirmText="Remove"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleRemoveMemberDialogClose">
        </ConfirmDialog>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import ddb from 'ddb';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: { Window, ConfirmDialog },

    props: {
        orgSlug: { type: String, required: true },
        isOwner: { type: Boolean, default: false },
        isAdmin: { type: Boolean, default: false }
    },

    data() {
        return {
            loading: true,
            error: null,
            featureEnabled: false,
            members: [],
            allUsers: [],
            canManageMembers: false,
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
            return this.allUsers.filter(u => !memberUserNames.includes(u.userName));
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

                // Determine if user can manage members
                this.canManageMembers = this.isOwner || this.isAdmin;

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
                this.$nextTick(() => {
                    this.initUserDropdown();
                    this.initPermDropdowns();
                });
            }
        },

        initUserDropdown() {
            if (!this.$refs.userDropdown) return;

            $(this.$refs.userDropdown).dropdown({
                fullTextSearch: true,
                match: 'text',
                onChange: (value) => {
                    this.newMember.userName = value;
                }
            });
        },

        initPermDropdowns() {
            $(this.$el).find('select.ui.selection.dropdown').dropdown();
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

                // Clear dropdown selection
                this.$nextTick(() => {
                    if (this.$refs.userDropdown) {
                        $(this.$refs.userDropdown).dropdown('clear');
                    }
                    if (this.$refs.addPermDropdown) {
                        $(this.$refs.addPermDropdown).dropdown('set selected', '1');
                    }
                });

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
            } catch (e) {
                this.error = e.message || 'Failed to remove member';
            } finally {
                this.removingMember = null;
                this.memberToRemove = null;
            }
        },

        formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        },

        close() {
            this.$emit('onClose');
        }
    }
};
</script>

<style scoped>
.members-dialog {
    padding: 1em;

    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.add-member-section {
    margin-bottom: 1em;
}

.buttons {
    margin-top: 1.5em;
    text-align: right;
}

table.ui.celled.table {
    margin-top: 0.5em;
}

.ui.selection.dropdown {
    cursor: pointer !important;
}

.ui.selection.dropdown .menu > .item {
    cursor: pointer !important;
}
</style>
