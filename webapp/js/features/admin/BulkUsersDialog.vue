<template>
    <Window id="bulkUsersDialog" :title="title" modal size-class="dialog-xl" fixed-size
            :confirm-label="result ? '' : confirmLabel" :confirm-disabled="!chosen" :busy="busy"
            :close-button="!!result" cancel-label="Close"
            @confirm="run" @close="close">
        <div class="bulk-users-dialog">
            <PrimeMessage severity="info" :closable="false">
                Applies to {{ countOf(users.length, 'selected user') }}: <strong>{{ names }}</strong>
            </PrimeMessage>

            <div v-if="mode === 'role'" class="field mt-3">
                <label id="bulk-users-role-label" for="bulk-users-role" class="d-block mb-1 fw-semibold">Role to add</label>
                <Select v-model="role" input-id="bulk-users-role" aria-labelledby="bulk-users-role-label" :options="roleOptions"
                        placeholder="Select a role" class="w-100" :disabled="busy || !!result" />
            </div>

            <template v-else>
                <LoadingSpinner v-if="loading" />
                <div v-else class="d-flex gap-3 flex-wrap align-items-end mt-3">
                    <div class="flex-grow-1" style="min-width: min(12rem, 100%);">
                        <label id="bulk-users-org-label" for="bulk-users-org" class="d-block mb-1 fw-semibold">Organization</label>
                        <Select v-model="organization" input-id="bulk-users-org" aria-labelledby="bulk-users-org-label" :options="organizationOptions"
                                option-label="label" option-value="value" filter filter-placeholder="Search organizations"
                                :pt="{ pcFilter: { root: { 'aria-label': 'Search organizations' } } }"
                                placeholder="Select an organization" class="w-100" :disabled="busy || !!result" />
                    </div>
                    <div style="min-width: min(10rem, 100%);">
                        <label id="bulk-users-permissions-label" for="bulk-users-permissions" class="d-block mb-1 fw-semibold">Permissions</label>
                        <Select v-model="permissions" input-id="bulk-users-permissions" aria-labelledby="bulk-users-permissions-label" :options="PERMISSION_OPTIONS"
                                option-label="label" option-value="value" class="w-100" :disabled="busy || !!result" />
                    </div>
                </div>
                <PrimeMessage v-if="loadError" severity="error" role="alert" :closable="false" class="mt-3">{{ loadError }}</PrimeMessage>
            </template>

            <!-- What happened, for each user that it did not work for -->
            <PrimeMessage v-if="result" :severity="result.failed.length ? 'warn' : 'success'" role="status" :closable="false" class="mt-3 bulk-result">
                {{ summary }}
            </PrimeMessage>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Select from 'primevue/select';
import PrimeMessage from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';
import { countOf } from '@/libs/format';
import { pickableRoles, rolesToSend } from '@/libs/roles';
import { bulkSummary } from '@/libs/userBulk';

// How much a member of an organization may do (the same choices as the organizations of one user)
const PERMISSION_OPTIONS = Object.freeze([
    { value: 0, label: 'Read Only' },
    { value: 1, label: 'Read/Write' },
    { value: 2, label: 'Read/Write/Delete' },
    { value: 3, label: 'Admin' }
]);

// Names listed before "and N more"
const LISTED = 5;

/**
 * BulkUsersDialog - Add role / Add to organization for the users selected in the Users list (FR-ADM-23). One request per
 * user, one after the other; the summary says for which users it worked and for which it did not.
 */
export default {
    components: { Window, LoadingSpinner, Select, PrimeMessage },
    props: {
        // 'role' adds a role to each user; 'organization' adds each to an organization
        mode: { type: String, required: true },
        users: { type: Array, required: true },
        availableRoles: { type: Array, default: () => [] }
    },
    emits: ['close'],
    setup() {
        return { PERMISSION_OPTIONS, countOf };
    },
    data() {
        return {
            busy: false,
            role: null,
            organization: null,
            permissions: 1,
            organizations: [],
            loading: this.mode === 'organization',
            loadError: '',
            // { done, failed, skipped } once the action ran
            result: null
        };
    },
    computed: {
        title() {
            return this.mode === 'role' ? 'Add Role to Users' : 'Add Users to an Organization';
        },
        confirmLabel() {
            return this.mode === 'role' ? 'Add Role' : 'Add to Organization';
        },
        chosen() {
            return this.mode === 'role' ? !!this.role : !!this.organization;
        },
        names() {
            const names = this.users.map(u => u.userName);
            return names.length > LISTED ? `${names.slice(0, LISTED).join(', ')} and ${names.length - LISTED} more` : names.join(', ');
        },
        roleOptions() {
            return pickableRoles(this.availableRoles);
        },
        organizationOptions() {
            return this.organizations.map(o => ({ label: o.name || o.slug, value: o.slug }));
        },
        summary() {
            if (!this.result) return '';
            const verb = this.mode === 'role' ? `Added the role ${this.role} to` : `Added to ${this.organization}:`;
            return bulkSummary(verb, this.result);
        }
    },
    async mounted() {
        if (this.mode !== 'organization') return;
        try {
            const instances = await reg.orgs.getOrganizations();
            this.organizations = instances.map(i => i.org).filter(o => o.slug.toLowerCase() !== 'public');
        } catch (e) {
            this.loadError = e.message || 'Failed to load organizations';
        } finally {
            this.loading = false;
        }
    },
    methods: {
        async run() {
            if (!this.chosen || this.busy || this.result) return;
            this.busy = true;
            const done = [];
            const failed = [];
            const skipped = [];
            for (const user of this.users) {
                try {
                    if (this.mode === 'role') {
                        const roles = pickableRoles(user.roles);
                        if (roles.some(r => r.toLowerCase() === this.role.toLowerCase())) {
                            skipped.push(user.userName);
                            continue;
                        }
                        await reg.admin.updateUser(user.userName, undefined, rolesToSend([...roles, this.role], user.roles));
                    } else {
                        await reg.admin.addUserToOrganization(user.userName, this.organization, this.permissions);
                    }
                    done.push(user.userName);
                } catch (e) {
                    failed.push({ userName: user.userName, message: e.message || 'Failed' });
                }
            }
            this.busy = false;
            this.result = { done, failed, skipped };
            // All went through: the Users list refreshes at once, with the summary as the one report
            if (!failed.length) {
                this.$notify.success(this.summary, { summary: this.mode === 'role' ? 'Role Added' : 'Organization Added' });
                this.$emit('close', 'updated');
            }
        },

        close() {
            this.$emit('close', this.result?.done.length ? 'updated' : undefined);
        }
    }
};
</script>

<style scoped>
.bulk-users-dialog {
    padding: 0.25rem;
}
</style>
