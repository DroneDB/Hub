<template>
    <Window title="Manage Members" id="organizationMembersDialog" @onClose="close" modal maxWidth="800px" fixedSize>
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
            <div v-if="!featureEnabled && !loading" class="ui info message">
                <div class="header">Feature Disabled</div>
                <p>Organization member management is disabled on this server.</p>
            </div>

            <!-- Members list -->
            <div v-if="featureEnabled && !loading">
                <!-- Add member section -->
                <div class="add-member-section" v-if="canManageMembers">
                    <h4>Add Member</h4>
                    <div class="ui form">
                        <div class="fields">
                            <div class="seven wide field">
                                <label>User</label>
                                <select v-model="newMember.userId">
                                    <option value="">Select user...</option>
                                    <option v-for="user in availableUsers" :key="user.id" :value="user.id">
                                        {{ user.userName }} ({{ user.email }})
                                    </option>
                                </select>
                            </div>
                            <div class="five wide field">
                                <label>Permission</label>
                                <select v-model="newMember.permission">
                                    <option v-for="perm in permissionOptions" :key="perm.value" :value="perm.value">
                                        {{ perm.label }}
                                    </option>
                                </select>
                            </div>
                            <div class="four wide field">
                                <label>&nbsp;</label>
                                <button class="ui primary button" @click="addMember" :disabled="!newMember.userId || addingMember">
                                    <i class="plus icon"></i>&nbsp;Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="ui divider" v-if="canManageMembers"></div>

                <!-- Current members table -->
                <h4>Current Members</h4>
                <table class="ui celled table" v-if="members.length > 0">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Email</th>
                            <th>Permission</th>
                            <th>Granted</th>
                            <th v-if="canManageMembers">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="member in members" :key="member.userId">
                            <td>{{ member.userName }}</td>
                            <td>{{ member.email }}</td>
                            <td>
                                <select v-if="canManageMembers"
                                        v-model="member.permission"
                                        @change="updatePermission(member)">
                                    <option v-for="perm in permissionOptions" :key="perm.value" :value="perm.value">
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
                                <button class="ui red mini button" @click="removeMember(member)" :disabled="removingMember === member.userId">
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
    </Window>
</template>

<script>
import Window from '../Window.vue';
import ddb from 'ddb';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: { Window },

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
                userId: '',
                permission: 1 // Default to ReadWrite
            },
            permissionOptions: [
                { value: 0, label: 'Read Only' },
                { value: 1, label: 'Read/Write' },
                { value: 2, label: 'Read/Write/Delete' },
                { value: 3, label: 'Admin' }
            ]
        };
    },

    computed: {
        availableUsers() {
            const memberIds = this.members.map(m => m.userId);
            return this.allUsers.filter(u => !memberIds.includes(u.id));
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
                this.featureEnabled = await reg.isOrganizationMemberManagementEnabled();

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
            }
        },

        async addMember() {
            if (!this.newMember.userId) return;

            this.addingMember = true;
            try {
                await reg.addOrganizationMember(
                    this.orgSlug,
                    this.newMember.userId,
                    this.newMember.permission
                );

                // Refresh members list
                await this.loadData();

                // Reset form
                this.newMember.userId = '';
                this.newMember.permission = 1;

            } catch (e) {
                this.error = e.message || 'Failed to add member';
            } finally {
                this.addingMember = false;
            }
        },

        async updatePermission(member) {
            try {
                await reg.updateMemberPermission(
                    this.orgSlug,
                    member.userId,
                    member.permission
                );
            } catch (e) {
                this.error = e.message || 'Failed to update permission';
                // Reload to get correct state
                await this.loadData();
            }
        },

        async removeMember(member) {
            if (!confirm(`Are you sure you want to remove ${member.userName} from this organization?`)) {
                return;
            }

            this.removingMember = member.userId;
            try {
                await reg.removeOrganizationMember(this.orgSlug, member.userId);
                await this.loadData();
            } catch (e) {
                this.error = e.message || 'Failed to remove member';
            } finally {
                this.removingMember = null;
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
    min-height: 300px;
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
</style>
