<template>
    <Window title="Manage User Organizations" id="organizationsDialog" @onClose="close" modal maxWidth="70%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>Organizations updated successfully!</strong></p>
            </div>

            <div class="ui message info">
                <p>Managing organizations for user: <strong>{{ user.userName }}</strong></p>
            </div>

            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>User Organizations</label>
                    <select multiple="multiple" v-model="selectedOrganizations" class="ui dropdown" ref="orgsDropdown">
                        <option v-for="org in availableOrganizations" :key="org.slug" :value="org.slug">
                            {{ org.name || org.slug }}
                        </option>
                    </select>
                    <small>Hold CTRL/⌘ to select multiple organizations</small>
                </div>

                <div v-if="currentOrganizations.length > 0" class="field">
                    <label>Current Organizations:</label>
                    <div class="ui horizontal list">
                        <div v-for="orgSlug in currentOrganizations" :key="orgSlug" class="item">
                            <div class="ui small label">
                                {{ getOrganizationName(orgSlug) }}
                            </div>
                        </div>
                    </div>
                </div>
            </form>
            <div class="buttons">
                <button @click="close()" class="ui button" :disabled="updating">
                    Cancel
                </button>
                <button @click="confirmUpdate()" :disabled="updating" :class="{ loading: updating }"
                    class="ui button primary">
                    Update Organizations
                </button>
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
    props: {
        user: {
            type: Object,
            required: true
        }
    },

    data: function () {
        return {
            updating: false,
            success: false,
            loading: true,
            error: "",
            availableOrganizations: [],
            currentOrganizations: [],
            selectedOrganizations: []
        };
    },
    mounted: async function () {
        await this.loadData();

        // Initialize Semantic UI dropdown
        this.$nextTick(() => {
            if (this.$refs.orgsDropdown) {
                $(this.$refs.orgsDropdown).dropdown({
                    allowAdditions: false,
                    onChange: (value, text, $selectedItem) => {
                        // Handle both string and array values from Semantic UI dropdown
                        if (Array.isArray(value)) {
                            this.selectedOrganizations = value;
                        } else {
                            this.selectedOrganizations = value ? value.split(',') : [];
                        }
                    }
                });

                // Set initial values
                $(this.$refs.orgsDropdown).dropdown('set exactly', this.selectedOrganizations);
            }
        });
    },
    methods: {
        async loadData() {
            try {
                this.loading = true;
                const [userOrgs, allOrgsInstances] = await Promise.all([
                    reg.getUserOrganizations(this.user.userName),
                    reg.getOrganizations()
                ]);

                // Extract org data from Organization instances
                const allOrgs = allOrgsInstances.map(instance => instance.org);

                // Filter out "Public" organization from both lists
                this.currentOrganizations = userOrgs
                    .filter(org => org.slug.toLowerCase() !== 'public')
                    .map(org => org.slug);
                this.selectedOrganizations = [...this.currentOrganizations];
                this.availableOrganizations = allOrgs.filter(org => org.slug.toLowerCase() !== 'public');
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },

        getOrganizationName(slug) {
            const org = this.availableOrganizations.find(o => o.slug === slug);
            return org ? (org.name || org.slug) : slug;
        },

        close: function () {
            this.$emit('onClose');
        },
        clearError: function () {
            this.error = "";
        },
        confirmUpdate: async function () {
            this.updating = true;
            this.error = ""; // Clear any previous errors
            try {
                const result = await reg.setUserOrganizations(this.user.userName, this.selectedOrganizations);

                // Success - show success message and close
                this.success = true;
                setTimeout(() => {
                    this.updating = false;
                    this.$emit('onClose', 'updated');
                }, 1500);
            } catch (e) {
                this.error = e.message || 'Failed to update organizations';
                this.updating = false;
            }
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 320px;
    padding: 4px;
}

.buttons {
    margin-top: 16px;
    text-align: right;
}

.form {
    margin-bottom: 20px;
}

.ui.horizontal.list .item {
    margin-right: 0.5rem;
}
</style>
