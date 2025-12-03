<template>
    <div id="account">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div v-else>
            <div class="top ui equal width grid middle aligned">
                <div class="column">
                    <h1>Account</h1>
                </div>
            </div>

            <!-- User Info Section -->
            <div class="ui segments account">
                <div class="ui segment user-info">
                    <div class="ui grid">
                        <div class="sixteen wide column">
                            <h3><i class="user icon"></i> User Information</h3>
                        </div>
                        <div class="eight wide column">
                            <div class="info-item">
                                <label>Username</label>
                                <p>{{ username }}</p>
                            </div>
                        </div>
                        <div class="eight wide column">
                            <div class="info-item">
                                <label>Email</label>
                                <p>{{ email || 'Not set' }}</p>
                            </div>
                        </div>
                        <div class="eight wide column" v-if="isAdmin">
                            <div class="info-item">
                                <label>Role</label>
                                <p><span class="ui label red"><i class="shield icon"></i> Administrator</span></p>
                            </div>
                        </div>
                        <div class="eight wide column">
                            <div class="info-item">
                                <label>Organizations</label>
                                <p>{{ organizationsCount }} organization{{ organizationsCount !== 1 ? 's' : '' }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Storage Section -->
            <div class="ui segments account">
                <div class="ui segment storage-info">
                    <div class="ui grid">
                        <div class="sixteen wide column">
                            <h3><i class="database icon"></i> Storage</h3>
                        </div>
                        <div class="sixteen wide column">
                            <div class="storage-bar-container">
                                <div class="storage-details">
                                    <span class="used">{{ formatBytes(storageUsed) }} used</span>
                                    <span class="available" v-if="storageTotal">of {{ formatBytes(storageTotal) }}</span>
                                    <span class="available" v-else>Unlimited</span>
                                </div>
                                <div class="ui progress" :class="storageProgressClass" v-if="storageTotal">
                                    <div class="bar" :style="{ width: storagePercentage + '%' }">
                                        <div class="progress">{{ storagePercentage }}%</div>
                                    </div>
                                </div>
                                <div class="ui progress green" v-else>
                                    <div class="bar" style="width: 100%">
                                        <div class="progress">Unlimited</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="sixteen wide column" style="margin-top: 12px;">
                            <button @click="handleUpload" class="ui button green">
                                <i class="upload icon"></i> Upload Files
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Security Section (only if account management is enabled) -->
            <div class="ui segments account" v-if="accountManagement">
                <div class="ui segment action-item" @click="handleChangePwd">
                    <div class="ui grid">
                        <div class="twelve wide column main">
                            <i class="lock icon"></i> Security
                        </div>
                        <div class="four wide column right aligned">
                            <button @click.stop="handleChangePwd" class="ui button icon small primary">
                                <i class="ui icon pencil"></i> Change Password
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Session Section -->
            <div class="ui segments account">
                <div class="ui segment action-item logout" @click="handleLogout">
                    <div class="ui grid">
                        <div class="twelve wide column main">
                            <i class="sign-out icon"></i> Session
                        </div>
                        <div class="four wide column right aligned">
                            <button @click.stop="handleLogout" class="ui button icon small red" :class="{ loading: loggingOut }">
                                <i class="ui icon sign-out"></i> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <ChangePwdDialog @onClose="showChangePwd = false" v-if="showChangePwd" />
    </div>
</template>

<script>
import Message from '../Message.vue';
import ChangePwdDialog from './ChangePwdDialog.vue';
import reg from '../../libs/sharedRegistry';
import { bytesToSize } from '../../libs/utils';
import { xAuthLogout } from '../../libs/xauth';

/* global HubOptions */

export default {
    components: {
        Message, ChangePwdDialog
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
                try {
                    const isLocalAuth = await reg.isUserManagementEnabled();
                    this.accountManagement = isLocalAuth && !HubOptions.disableAccountManagement;
                } catch (e) {
                    console.warn('Could not check account management:', e.message);
                    this.accountManagement = false;
                }

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
                this.$router.push({ name: "Login" }).catch(() => { });
            } catch (e) {
                this.error = e.message;
            }
            this.loggingOut = false;
        }
    }
}
</script>

<style scoped>
#account {
    margin: 12px auto;
    margin-top: 36px;
    max-width: 800px;
}

#account .top {
    margin-bottom: 12px;
}

#account .account {
    margin-bottom: 16px;
}

#account .account .segment h3 {
    margin: 0 0 16px 0;
    color: #333;
}

#account .account .segment h3 i.icon {
    margin-right: 10px;
}

#account .user-info .info-item {
    margin-bottom: 12px;
}

#account .user-info .info-item label {
    display: block;
    font-weight: bold;
    color: #666;
    font-size: 0.9em;
    margin-bottom: 4px;
}

#account .user-info .info-item p {
    margin: 0;
    font-size: 1.1em;
    color: #333;
}

#account .storage-info .storage-bar-container .storage-details {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.95em;
}

#account .storage-info .storage-bar-container .storage-details .used {
    font-weight: bold;
    color: #333;
}

#account .storage-info .storage-bar-container .storage-details .available {
    color: #666;
}

#account .storage-info .storage-bar-container .ui.progress {
    margin: 0;
}

#account .storage-info .storage-bar-container .ui.progress .bar {
    min-width: 0;
    transition: width 0.3s ease;
}

#account .storage-info .storage-bar-container .ui.progress .bar .progress {
    color: white;
}

#account .action-item {
    cursor: pointer;
    transition: background-color 0.2s ease;
}

#account .action-item:hover {
    background-color: #f5f5f5;
}

#account .action-item.logout:hover {
    background-color: #fff5f5;
}

#account .action-item .main {
    font-weight: bold;
    font-size: 1.1em;
    padding-top: 6px;
}

#account .action-item .main i.icon {
    margin-right: 15px;
}

.loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    font-size: 2em;
    color: #888;
}
</style>
