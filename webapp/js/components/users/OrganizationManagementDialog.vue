<template>
    <Window title="Organization Management" id="organizationManagementDialog" @onClose="close" modal maxWidth="80%" fixedSize>
        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <PrimeMessage v-if="success" severity="success" :closable="false">
                <strong>{{ successMessage }}</strong>
            </PrimeMessage>

            <Tabs :value="activeTab" @update:value="val => activeTab = val">
                <TabList>
                    <Tab value="list"><i class="fa-solid fa-list me-1"></i>Organizations List</Tab>
                    <Tab value="create"><i class="fa-solid fa-plus me-1"></i>Create Organization</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="list">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div style="flex: 1; max-width: 18.75rem;">
                                <IconField>
                                    <InputIcon class="fa-solid fa-magnifying-glass" />
                                    <InputText v-model="searchQuery" placeholder="Search organizations" class="w-100" />
                                </IconField>
                            </div>
                            <Button @click="loadOrganizations" icon="fa-solid fa-arrows-rotate" label="Refresh" />
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
                                        <Button @click="confirmDeleteOrganization(org)"
                                                severity="danger" size="small"
                                                :disabled="org.slug.toLowerCase() === 'public' || deleting === org.slug"
                                                :loading="deleting === org.slug"
                                                icon="fa-solid fa-trash" label="Delete"
                                                title="Delete Organization" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div v-else>
                            <PrimeMessage severity="info" :closable="false">
                                <strong>No Organizations Found</strong>
                                <p>{{ searchQuery ? 'Try adjusting your search criteria.' : 'No organizations available.' }}</p>
                            </PrimeMessage>
                        </div>
                    </TabPanel>
                    <TabPanel value="create">
                        <form v-on:submit.prevent v-bind:class="{ error: !!createError }">
                            <div class="mb-3">
                                <label class="d-block mb-1 fw-semibold">Organization Name <span class="text-danger">*</span></label>
                                <InputText ref="txtOrgName" @keydown="clearCreateError()" @keyup.enter="createOrganization()"
                                       v-model="newOrgName" placeholder="Enter organization name" class="w-100" />
                                <small>Organization names should be descriptive and will be converted to a valid slug</small>
                            </div>

                            <div class="mb-3">
                                <label class="d-block mb-1 fw-semibold">Organization Slug</label>
                                <InputText :modelValue="suggestedSlug" :placeholder="suggestedSlug" readonly class="w-100" />
                                <small>This is automatically generated from the name and cannot be changed later</small>
                            </div>

                            <div class="mb-3">
                                <label class="d-block mb-1 fw-semibold">Description (Optional)</label>
                                <Textarea v-model="newOrgDescription" placeholder="Brief description of the organization" rows="3" autoResize class="w-100" />
                            </div>

                            <div class="mb-3" v-if="createError">
                                <PrimeMessage severity="error" :closable="false">
                                    {{ createError }}
                                </PrimeMessage>
                            </div>

                            <div class="mb-3">
                                <Button @click="createOrganization()" :disabled="creating || !newOrgName.trim()"
                                        :loading="creating" severity="info" icon="fa-solid fa-plus" label="Create Organization" />
                            </div>
                        </form>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            <div class="d-flex justify-content-end gap-2 mt-3">
                <Button @click="close()" label="Close" />
            </div>
        </div>

        <!-- Delete Organization Confirmation Dialog -->
        <ConfirmDialog v-if="showDeleteDialog"
            title="Delete Organization"
            :message="`Are you sure you want to delete the organization <strong>${orgToDelete && (orgToDelete.name || orgToDelete.slug)}</strong>?<br/><br/><i class='fa-solid fa-triangle-exclamation'></i> This action cannot be undone. All data associated with this organization will be permanently removed.`"
            confirmText="Delete Organization"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleDeleteDialogClose">
        </ConfirmDialog>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import InputIcon from 'primevue/inputicon';
import IconField from 'primevue/iconfield';
import Textarea from 'primevue/textarea';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message, ConfirmDialog, Button, PrimeMessage, InputText,
        InputIcon, IconField, Textarea, Tabs, TabList, Tab, TabPanels, TabPanel
    },
    emits: ['onClose'],

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

        async handleDeleteDialogClose(action) {
            if (action === 'confirm') {
                await this.deleteOrganization();
            } else {
                this.showDeleteDialog = false;
                this.orgToDelete = null;
            }
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
    min-width: 25rem;
    padding: 0.25rem;
}

code {
    background-color: #f5f5f5;
    padding: 0.125rem 0.25rem;
    border-radius: 0.1875rem;
    font-family: monospace;
}
</style>
