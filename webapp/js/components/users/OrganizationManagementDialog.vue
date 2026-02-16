<template>
    <Window title="Organization Management" id="organizationManagementDialog" @onClose="close" modal maxWidth="80%" fixedSize>
        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>{{ successMessage }}</strong></p>
            </div>

            <div class="ui top attached tabular menu">
                <div class="item" :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">
                    <i class="list icon"></i>
                    Organizations List
                </div>
                <div class="item" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
                    <i class="plus icon"></i>
                    Create Organization
                </div>
            </div>

            <!-- Organizations List Tab -->
            <div v-if="activeTab === 'list'" class="ui bottom attached active tab segment">
                <div class="ui stackable grid">
                    <div class="eight wide column">
                        <div class="ui icon input fluid">
                            <input v-model="searchQuery" type="text" placeholder="Search organizations...">
                            <i class="search icon"></i>
                        </div>
                    </div>
                    <div class="eight wide column right aligned">
                        <button @click="loadOrganizations" class="ui button">
                            <i class="refresh icon"></i> Refresh
                        </button>
                    </div>
                </div>

                <table class="ui celled table" v-if="filteredOrganizations.length > 0">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Description</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="org in filteredOrganizations" :key="org.slug">
                            <td><strong>{{ org.name || org.slug }}</strong></td>
                            <td><code>{{ org.slug }}</code></td>
                            <td>{{ org.description || '-' }}</td>
                            <td>
                                <button @click="confirmDeleteOrganization(org)"
                                        class="ui small red button"
                                        :disabled="org.slug.toLowerCase() === 'public' || deleting === org.slug"
                                        :class="{ loading: deleting === org.slug }"
                                        title="Delete Organization">
                                    <i class="trash icon"></i>
                                    Delete
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-else class="ui message info">
                    <div class="header">No Organizations Found</div>
                    <p>{{ searchQuery ? 'Try adjusting your search criteria.' : 'No organizations available.' }}</p>
                </div>
            </div>

            <!-- Create Organization Tab -->
            <div v-if="activeTab === 'create'" class="ui bottom attached active tab segment">
                <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!createError }">
                    <div class="field">
                        <label>Organization Name <span class="text-red">*</span></label>
                        <input ref="txtOrgName" v-on:keydown="clearCreateError()" v-on:keyup.enter="createOrganization()"
                               type="text" v-model="newOrgName" placeholder="Enter organization name" />
                        <small>Organization names should be descriptive and will be converted to a valid slug</small>
                    </div>

                    <div class="field">
                        <label>Organization Slug</label>
                        <input type="text" v-model="newOrgSlug" :placeholder="suggestedSlug" readonly />
                        <small>This is automatically generated from the name and cannot be changed later</small>
                    </div>

                    <div class="field">
                        <label>Description (Optional)</label>
                        <textarea v-model="newOrgDescription" placeholder="Brief description of the organization"></textarea>
                    </div>

                    <div class="field" v-if="createError">
                        <div class="ui negative message">
                            <p>{{ createError }}</p>
                        </div>
                    </div>

                    <div class="field">
                        <button @click="createOrganization()" :disabled="creating || !newOrgName.trim()"
                                :class="{ loading: creating }" class="ui primary button">
                            <i class="plus icon"></i>Create Organization
                        </button>
                    </div>
                </form>
            </div>

            <div class="dialog-buttons">
                <button @click="close()" class="ui button">
                    Close
                </button>
            </div>
        </div>

        <!-- Delete Organization Confirmation Dialog -->
        <div v-if="showDeleteDialog" class="ui dimmer modals page transition visible active" style="display: flex !important; align-items: center; justify-content: center;">
            <div class="ui small modal transition visible active" style="position: relative; top: auto; left: auto; margin: 0;">
                <i class="close icon" @click="showDeleteDialog = false"></i>
                <div class="header">
                    <i class="trash icon"></i>
                    Delete Organization
                </div>
                <div class="content">
                    <p>Are you sure you want to delete the organization <strong>{{ orgToDelete && orgToDelete.name || orgToDelete.slug }}</strong>?</p>
                    <p class="ui warning message">
                        <i class="warning icon"></i>
                        This action cannot be undone. All data associated with this organization will be permanently removed.
                    </p>
                </div>
                <div class="actions">
                    <button class="ui button" @click="showDeleteDialog = false">
                        Cancel
                    </button>
                    <button class="ui red button" @click="deleteOrganization" :class="{ loading: deleting === (orgToDelete && orgToDelete.slug) }">
                        <i class="trash icon"></i>
                        Delete Organization
                    </button>
                </div>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message
    },

    data: function () {
        return {
            loading: true,
            error: "",
            success: false,
            successMessage: "",
            activeTab: "list",
            organizations: [],
            searchQuery: "",
            deleting: null,
            showDeleteDialog: false,
            orgToDelete: null,

            // Create form
            newOrgName: "",
            newOrgDescription: "",
            creating: false,
            createError: ""
        };
    },

    computed: {
        filteredOrganizations: function() {
            let filtered = this.organizations;

            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(org => {
                    const name = (org.name || '').toLowerCase();
                    const slug = (org.slug || '').toLowerCase();
                    const description = (org.description || '').toLowerCase();
                    return name.includes(query) || slug.includes(query) || description.includes(query);
                });
            }

            return filtered;
        },

        newOrgSlug: function() {
            return this.suggestedSlug;
        },

        suggestedSlug: function() {
            if (!this.newOrgName.trim()) return "";

            // Convert name to valid slug
            return this.newOrgName
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '') // Remove invalid characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
        }
    },

    mounted: async function () {
        await this.loadOrganizations();
    },

    methods: {
        async loadOrganizations() {
            try {
                this.loading = true;
                const orgInstances = await reg.getOrganizations();
                // Extract org data from Organization instances
                this.organizations = orgInstances.map(instance => instance.org);
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },

        close: function () {
            this.$emit('onClose');
        },

        confirmDeleteOrganization: function(org) {
            if (org.slug.toLowerCase() === 'public') {
                this.error = "The Public organization cannot be deleted.";
                return;
            }
            this.orgToDelete = org;
            this.showDeleteDialog = true;
        },

        async deleteOrganization() {
            if (!this.orgToDelete) return;

            try {
                this.deleting = this.orgToDelete.slug;

                await reg.deleteOrganization(this.orgToDelete.slug);

                // Remove organization from list
                this.organizations = this.organizations.filter(org => org.slug !== this.orgToDelete.slug);

                this.success = true;
                this.successMessage = `Organization "${this.orgToDelete.name || this.orgToDelete.slug}" deleted successfully!`;

                // Close dialog and reset state
                this.showDeleteDialog = false;
                this.orgToDelete = null;
                this.deleting = null;

                // Clear success message after some time
                setTimeout(() => {
                    this.success = false;
                    this.successMessage = "";
                }, 3000);

            } catch (e) {
                this.error = e.message || 'Failed to delete organization';
                this.deleting = null;
            }
        },

        async createOrganization() {
            if (!this.newOrgName.trim()) return;

            const slug = this.suggestedSlug;
            if (!slug) {
                this.createError = "Please enter a valid organization name";
                return;
            }

            this.creating = true;
            this.createError = "";

            try {
                const newOrg = await reg.createOrganization({
                    name: this.newOrgName.trim(),
                    slug: slug,
                    description: this.newOrgDescription.trim() || undefined
                });

                // Add to organizations list
                this.organizations.push(newOrg);

                this.success = true;
                this.successMessage = `Organization "${this.newOrgName}" created successfully!`;

                // Reset form
                this.resetCreateForm();

                // Switch to list tab
                this.activeTab = "list";

                // Clear success message after some time
                setTimeout(() => {
                    this.success = false;
                    this.successMessage = "";
                }, 3000);

            } catch (e) {
                this.createError = e.message || 'Failed to create organization';
            }
            this.creating = false;
        },

        resetCreateForm: function() {
            this.newOrgName = "";
            this.newOrgDescription = "";
            this.createError = "";
        },

        clearCreateError: function() {
            this.createError = "";
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 400px;
    padding: 4px;
}

.dialog-buttons {
    margin-top: 16px;
    text-align: right;
}

.text-red {
    color: #e74c3c;
}

textarea {
    min-height: 60px;
    resize: vertical;
}

.ui.tab.segment {
    padding: 1rem;
}

code {
    background-color: #f5f5f5;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
}

.ui.top.attached.tabular.menu {
    .item {
        cursor: pointer;
        &.active {
            cursor: default;
        }
    }

}

</style>
