<template>
    <div id="account">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div v-else>
            <div class="top-header">
                <h1>Account</h1>
            </div>

            <!-- User Info Section -->
            <Card class="account-card">
                <template #content>
                    <h3><i class="fa-solid fa-user"></i> User Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Username</label>
                            <p>{{ username }}</p>
                        </div>
                        <div class="info-item">
                            <label>Email</label>
                            <p>{{ email || 'Not set' }}</p>
                        </div>
                        <div class="info-item" v-if="isAdmin">
                            <label>Role</label>
                            <p><Tag severity="danger"><i class="fa-solid fa-shield"></i> Administrator</Tag></p>
                        </div>
                        <div class="info-item">
                            <label>Organizations</label>
                            <p>{{ organizationsCount }} organization{{ organizationsCount !== 1 ? 's' : '' }}</p>
                        </div>
                    </div>
                </template>
            </Card>

            <!-- Storage Section -->
            <Card class="account-card">
                <template #content>
                    <h3><i class="fa-solid fa-database"></i> Storage</h3>
                    <div class="storage-bar-container">
                        <div class="storage-details">
                            <span class="used">{{ formatBytes(storageUsed) }} used</span>
                            <span class="available" v-if="storageTotal">of {{ formatBytes(storageTotal) }}</span>
                            <span class="available" v-else>Unlimited</span>
                        </div>
                        <ProgressBar v-if="storageTotal" :value="storagePercentage" :showValue="true" />
                        <ProgressBar v-else :value="100" :showValue="false" />
                    </div>
                    <div class="mt-3">
                        <Button @click="handleUpload" severity="success" icon="fa-solid fa-upload" label="Upload Files" />
                    </div>
                </template>
            </Card>

            <!-- Security Section (only if account management is enabled) -->
            <Card class="account-card action-card" v-if="accountManagement" @click="handleChangePwd">
                <template #content>
                    <div class="action-row">
                        <div class="main">
                            <i class="fa-solid fa-lock"></i> Security
                        </div>
                        <div>
                            <Button @click.stop="handleChangePwd" severity="info" size="small" icon="fa-solid fa-pencil" label="Change Password" />
                        </div>
                    </div>
                </template>
            </Card>

            <!-- Session Section -->
            <Card class="account-card action-card logout" @click="handleLogout">
                <template #content>
                    <div class="action-row">
                        <div class="main">
                            <i class="fa-solid fa-right-from-bracket"></i> Session
                        </div>
                        <div>
                            <Button @click.stop="handleLogout" severity="danger" size="small" :loading="loggingOut" icon="fa-solid fa-right-from-bracket" label="Logout" />
                        </div>
                    </div>
                </template>
            </Card>
        </div>

        <ChangePwdDialog @onClose="showChangePwd = false" v-if="showChangePwd" />
    </div>
</template>

<script>
import Message from '../Message.vue';
import ChangePwdDialog from './ChangePwdDialog.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import ProgressBar from 'primevue/progressbar';
import Tag from 'primevue/tag';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';
import { bytesToSize } from '../../libs/utils';
import { xAuthLogout } from '../../libs/xauth';

/* global HubOptions */

export default {
    components: {
        Message, ChangePwdDialog, Button, Card, ProgressBar, Tag
    },
    data: function () {
        return {
            error: "",
            loading: false,
            loggingOut: false,

            showChangePwd: false,

            // User info
            username: "",
            email: "",
            isAdmin: false,
            organizationsCount: 0,

            // Storage info
            storageUsed: 0,
            storageTotal: null,

            // Account management availability
            accountManagement: false
        }
    },
    computed: {
        storagePercentage() {
            if (!this.storageTotal || this.storageTotal === 0) return 0;
            return Math.min(100, Math.round((this.storageUsed / this.storageTotal) * 100));
        },
        storageProgressClass() {
            if (this.storagePercentage >= 90) return 'red';
            if (this.storagePercentage >= 70) return 'yellow';
            return 'green';
        }
    },
    mounted: async function () {
        await this.loadUserInfo();
    },
    methods: {
        formatBytes(bytes) {
            return bytesToSize(bytes);
        },

        async loadUserInfo() {
            this.loading = true;
            try {
                // Get username and admin status from registry
                this.username = reg.getUsername() || '';
                this.isAdmin = reg.isAdmin();

                // Check if account management is available
                const isLocalAuth = reg.getFeature(Features.USER_MANAGEMENT);
                this.accountManagement = isLocalAuth && !HubOptions.disableAccountManagement;

                // Get user organizations
                try {
                    const orgs = await reg.getUserOrganizations(this.username);
                    this.organizationsCount = orgs ? orgs.length : 0;
                } catch (e) {
                    console.warn('Could not load organizations:', e.message);
                    this.organizationsCount = 0;
                }

                // Get storage info
                try {
                    const storageInfo = await reg.getUserStorageInfo(this.username);
                    this.storageUsed = storageInfo.used || 0;
                    this.storageTotal = storageInfo.total || null;
                } catch (e) {
                    console.warn('Could not load storage info:', e.message);
                }

                // Try to get email from detailed user info if admin
                if (this.isAdmin) {
                    try {
                        const users = await reg.usersDetailed();
                        const currentUser = users.find(u => u.userName === this.username);
                        if (currentUser) {
                            this.email = currentUser.email || '';
                        }
                    } catch (e) {
                        console.warn('Could not load user details:', e.message);
                    }
                }
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },

        handleChangePwd() {
            this.showChangePwd = true;
        },

        handleUpload() {
            this.$router.push({ name: "Upload" });
        },

        async handleLogout() {
            this.loggingOut = true;
            try {
                reg.logout();
                await xAuthLogout();
            } catch (e) {
                console.warn('Logout error:', e.message);
            } finally {
                this.loggingOut = false;
                this.$router.push({ name: "Login" }).catch(() => { });
            }
        }
    }
}
</script>

<style scoped>
#account {
    margin: 0.75rem auto;
    margin-top: 2.25rem;
    max-width: 50rem;
}

#account .top-header {
    margin-bottom: 0.75rem;
}

#account .account-card {
    margin-bottom: 1rem;
}

#account .account-card h3 {
    margin: 0 0 1rem 0;
    color: var(--ddb-text);
}

#account .account-card h3 i {
    margin-right: 0.5rem;
}

.info-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
}

.info-grid .info-item {
    flex: 0 0 calc(50% - 0.5rem);
    min-width: 12.5rem;
}

.info-item label {
    display: block;
    font-weight: bold;
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
    margin-bottom: 0.25rem;
}

.info-item p {
    margin: 0;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text);
}

.storage-bar-container .storage-details {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: var(--ddb-font-size-base);
}

.storage-bar-container .storage-details .used {
    font-weight: bold;
    color: var(--ddb-text);
}

.storage-bar-container .storage-details .available {
    color: var(--ddb-text-secondary);
}

.action-card {
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.action-card:hover {
    background-color: var(--ddb-bg-subtle);
}

.action-card.logout:hover {
    background-color: var(--ddb-danger-bg);
}

.action-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.action-row .main {
    font-weight: bold;
    font-size: var(--ddb-font-size-base);
}

.action-row .main i {
    margin-right: 1rem;
}

.loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 12.5rem;
    font-size: var(--ddb-font-size-xl);
    color: var(--ddb-text-muted);
}
</style>
