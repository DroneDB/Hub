<template>
    <div id="header">
        <a :href="homeUrl" class="logo">
            <img v-if="appLogo" :src="appLogo">
            <template v-else>
                <i class="app-icon" :class="appIcon" />
                <div class="app-name">{{ appName }}</div>
            </template>
        </a>

        <div class="right">

            <Button v-if="showBackToOrg" @click="goToOrganization" severity="secondary" size="small" text
                title="Back to organization">
                <i class="fa-solid fa-sitemap"></i>
            </Button>
            <Button v-if="showDownload" @click="handleDownload" severity="secondary" size="small" text
                :title="selectedFiles.length > 0 ? `Download ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` : 'Download'" :disabled="isDownloading">
                <i class="fa-solid fa-download"></i>
                <span v-if="selectedFiles.length > 0" style="line-height: 1;" class="ms-1">{{ selectedFiles.length }}</span>
            </Button>
            <Button v-if="showSettings" @click="handleSettings" severity="secondary" size="small" text title="Settings">
                <i class="fa-solid fa-wrench"></i>
            </Button>

            <ConfirmDialog v-if="downloadConfirmOpen"
                title="Download"
                :message="downloadConfirmMessage"
                confirmText="Download"
                cancelText="Cancel"
                confirmButtonClass="primary"
                @onClose="handleDownloadConfirmClose">
            </ConfirmDialog>

            <Alert title="Storage Info" v-if="storageInfoDialogOpen" @onClose="handleStorageInfoDialogClose">
                <div class="storage-info-content">
                    <template v-if="storageInfo.used > 0">
                        <ProgressBar :value="storagePercent" :showValue="false"
                            :pt="{ value: { style: { background: storageBarColor } } }"
                            class="storage-progress-bar" />
                        <div class="storage-percentage" :style="{ color: storageBarColor }">
                            {{ percent(storageInfo.usedPercentage, 1) }}
                        </div>
                        <table style="width: 100%; margin-bottom: 0; margin-top: 1rem; color: var(--ddb-text-secondary);">
                            <thead><tr>
                                <th><b>Total</b></th>
                                <th><b>Used</b></th>
                                <th v-if="storageInfo.free > 0"><b>Free</b></th>
                            </tr></thead>
                            <tbody><tr>
                                <td>{{ bytes(storageInfo.total) }}</td>
                                <td>{{ bytes(storageInfo.used) }}</td>
                                <td v-if="storageInfo.free > 0">{{ bytes(storageInfo.free) }}</td>
                            </tr></tbody>
                        </table>
                        <div v-if="storageInfo.free <= 0" class="storage-warning">
                            <i class="fa-solid fa-triangle-exclamation"></i> No storage left!
                        </div>
                    </template>
                    <template v-else>
                        <table style="width: 100%; margin-bottom: 0; color: var(--ddb-text-secondary);">
                            <thead><tr>
                                <th><b>Total</b></th>
                            </tr></thead>
                            <tbody><tr>
                                <td>{{ bytes(storageInfo.total) }}</td>
                            </tr></tbody>
                        </table>
                    </template>
                </div>
            </Alert>

            <Button v-if="!loggedIn" severity="info" size="small" @click="login">
                <i class="fa-solid fa-lock"></i><span class="mobile hide"> Sign In</span>
            </Button>
            <Button v-else severity="secondary" size="small" text
                @click="toggleUserMenu" :title="username" aria-haspopup="true" aria-controls="user_menu">
                <i class="fa-solid fa-user"></i>
            </Button>
            <Menu ref="userMenu" id="user_menu" :model="userMenuItems" :popup="true" />
        </div>
    </div>
</template>

<script>
import { utils } from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import Alert from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';
import { xAuthLogout } from '@/libs/api/xauth';
import { isMobile } from '@/libs/responsive';
import { bytesToSize } from '@/libs/utils';
import emitter from '@/libs/eventBus';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import ProgressBar from 'primevue/progressbar';

export default {
    components: {
        Alert,
        ConfirmDialog,
        Button,
        Menu,
        ProgressBar
    },
    data: function () {

        const loggedIn = reg.isLoggedIn();

        return {
            username: reg.getUsername(),
            loggedIn: loggedIn,
            isAdmin: reg.isAdmin(),
            params: this.$route.params,
            showDownload: !!this.$route.params.ds,
            showSettings: loggedIn && !!this.$route.params.ds && !this.$route.params.encodedPath,
            showBackToOrg: false,
            orgInfoCache: {},
            selectedFiles: [],
            isDownloading: false,
            downloadConfirmOpen: false,
            storageInfo: null,
            storageInfoDialogOpen: false,
            usersManagement: false,
            accountManagement: false
        }
    },

    computed: {
        storageBarColor: function () {
            if (!this.storageInfo || this.storageInfo.usedPercentage == null) return 'var(--ddb-success)';
            const pct = this.storageInfo.usedPercentage * 100;
            if (pct >= 90) return 'var(--ddb-danger)';
            if (pct >= 70) return 'var(--ddb-warning)';
            if (pct >= 50) return 'var(--ddb-warning)';
            return 'var(--ddb-success)';
        },
        storagePercent: function () {
            if (!this.storageInfo || this.storageInfo.usedPercentage == null) return 0;
            return Math.min(this.storageInfo.usedPercentage * 100, 100);
        },
        homeUrl: function () {
            const org = HubOptions.singleOrganization !== undefined ?
                HubOptions.singleOrganization :
                this.username;

            if (this.loggedIn) {
                return `/r/${org}`;
            } else return "/";
        },

        downloadUrl: function () {
            const { org, ds } = this.params;
            if (org && ds) {
                const dataset = reg.Organization(org).Dataset(ds);

                if (this.selectedFiles.length > 0) {
                    return dataset.downloadUrl(this.selectedFiles.map(f => {
                        const { path } = utils.parseUri(f.path);
                        return path;
                    }));
                } else {
                    return dataset.downloadUrl();
                }
            }
        },

        downloadLabel: function () {
            if (this.selectedFiles.length > 0) {
                return `${this.selectedFiles.length}`;
            } else {
                return "Download";
            }
        },

        showDownloadIcon: function () {
            if (!isMobile()) return true;
            else return this.selectedFiles.length == 0;
        },

        fileUploads: function () {
            return !HubOptions.disableDatasetCreation;
        },

        appLogo: function () {
            return HubOptions.appLogo;
        },
        appIcon: function () {
            return (HubOptions.appIcon === "dronedb" || HubOptions.appIcon === undefined) ?
                "icon-dronedb" :
                `icon ${HubOptions.appIcon}`;
        },
        appName: function () {
            return HubOptions.appName !== undefined ? HubOptions.appName : "DroneDB";
        },
        downloadConfirmMessage: function () {
            if (this.selectedFiles.length > 0) {
                return `Are you sure you want to download ${this.selectedFiles.length} selected file${this.selectedFiles.length !== 1 ? 's' : ''}?`;
            }
            return 'Are you sure you want to download the entire dataset?';
        },
        userMenuItems: function () {
            const items = [];

            items.push({ label: this.username + (this.isAdmin && this.username !== 'admin' ? ' — admin' : ''), disabled: true, class: 'user-menu-header' });
            items.push({ separator: true });

            if (this.fileUploads)
                items.push({ label: 'Upload Files', icon: 'fa-solid fa-cloud-arrow-up fixed-icon', command: () => this.uploadFiles() });

            items.push({ label: 'My Organizations', icon: 'fa-solid fa-sitemap fixed-icon', command: () => this.myOrganizations() });
            items.push({ label: 'My Datasets', icon: 'fa-solid fa-database fixed-icon', command: () => this.myDatasets() });

            if (this.storageInfo) {
                items.push({ separator: true });
                if (this.storageInfo.total != null && this.storageInfo.used > 0) {
                    items.push({ label: this.percent(this.storageInfo.usedPercentage, 2), icon: 'fa-regular fa-hard-drive fixed-icon', command: () => { this.storageInfoDialogOpen = true; } });
                } else if (this.storageInfo.total != null && !this.storageInfo.used) {
                    items.push({ label: this.bytes(this.storageInfo.total), icon: 'fa-regular fa-hard-drive fixed-icon', command: () => {} });
                } else if (this.storageInfo.total == null) {
                    items.push({ label: this.bytes(this.storageInfo.used), icon: 'fa-regular fa-hard-drive fixed-icon', command: () => {} });
                }
            }

            if ((this.accountManagement && this.loggedIn) || (this.usersManagement && this.isAdmin)) {
                items.push({ separator: true });
            }
            if (this.accountManagement && this.loggedIn) {
                items.push({ label: 'My Account', icon: 'fa-solid fa-user fixed-icon', command: () => this.manageAccount() });
            }
            if (this.usersManagement && this.isAdmin) {
                items.push({ label: 'Manage Users', icon: 'fa-solid fa-users fixed-icon', command: () => this.manageUsers() });
            }

            items.push({ separator: true });
            items.push({ label: 'Logout', icon: 'fa-solid fa-right-from-bracket fixed-icon', command: () => this.logout() });

            return items;
        }
    },
    mounted: function () {
        reg.addEventListener('login', this.onRegLogin);
        reg.addEventListener('logout', this.onRegLogout);

        this._onAddItems = () => {
            this.refreshStorageInfo();
        };
        this._onDeleteEntries = () => {
            this.refreshStorageInfo();
        };
        emitter.on('addItems', this._onAddItems);
        emitter.on('deleteEntries', this._onDeleteEntries);

        this._onSetSelectedFiles = (files) => {
            this.selectedFiles = files;
        };
        emitter.on('setSelectedFiles', this._onSetSelectedFiles);

        this.refreshStorageInfo();
        this.checkUserManagement();
        this.updateBackToOrgVisibility();
    },
    watch: {
        $route: function (to, from) {
            const { params } = to;

            this.showDownload = !!params.ds;
            this.showSettings = reg.isLoggedIn() && !!this.$route.params.ds;

            this.params = params;
            this.updateBackToOrgVisibility();
        }
    },
    beforeUnmount: function () {
        reg.removeEventListener('login', this.onRegLogin);
        reg.removeEventListener('logout', this.onRegLogout);

        emitter.off('addItems', this._onAddItems);
        emitter.off('deleteEntries', this._onDeleteEntries);
        emitter.off('setSelectedFiles', this._onSetSelectedFiles);
    },
    methods: {
        handleStorageInfoDialogClose: function () {
            this.storageInfoDialogOpen = false;
        },

        goToOrganization: function () {
            const org = this.$route.params.org;
            if (org) {
                this.$router.push({ name: 'Datasets', params: { org } });
            }
        },

        updateBackToOrgVisibility: async function () {
            const org = this.$route.params.org;
            const ds = this.$route.params.ds;
            if (!org || !ds) {
                this.showBackToOrg = false;
                return;
            }
            try {
                let orgInfo = this.orgInfoCache[org];
                if (!orgInfo) {
                    orgInfo = await reg.Organization(org).info();
                    this.orgInfoCache[org] = orgInfo;
                }
                this.showBackToOrg = orgInfo.isPublic || (orgInfo.permissions && orgInfo.permissions.canRead);
            } catch (e) {
                this.showBackToOrg = false;
            }
        },

        refreshStorageInfo: async function () {
            if (!HubOptions.disableStorageInfo) {
                try {
                    this.storageInfo = await reg.storageInfo();
                } catch (e) {
                    console.log(e.message);
                }
            }
        },
        uploadFiles: function () {
            this.$router.push({ name: "Upload" });
        },
        myDatasets: function () {
            this.$router.push({ name: "Datasets", params: { org: HubOptions.singleOrganization !== undefined ? HubOptions.singleOrganization : reg.getUsername() } });
        },
        myOrganizations: function () {
            this.$router.push({ name: "Organizations" });
        },
        manageUsers: function () {
            this.$router.push({ name: "Users" });
        },
        manageAccount: function () {
            this.$router.push({ name: "Account" });
        },
        handleDownload: function () {
            this.downloadConfirmOpen = true;
        },

        handleDownloadConfirmClose: async function (action) {
            this.downloadConfirmOpen = false;

            if (action !== 'confirm') return;
            if (this.isDownloading) return;

            this.isDownloading = true;

            try {
                const { org, ds } = this.params;
                const dataset = reg.Organization(org).Dataset(ds);

                const paths = this.selectedFiles.length > 0
                    ? this.selectedFiles.map(f => {
                        const { path } = utils.parseUri(f.path);
                        return path;
                    })
                    : undefined;

                await dataset.downloadWithCheck(paths);
            } catch (err) {
                if (err.status === 429) {
                    emitter.emit('downloadLimitReached', err.message);
                } else {
                    alert(err.message || err);
                }
            } finally {
                this.isDownloading = false;
            }
        },

        handleSettings: function () {
            emitter.emit("openSettings");
        },

        onRegLogin: async function (username) {
            this.username = username;
            this.loggedIn = true;
            this.isAdmin = reg.isAdmin();
            this.refreshStorageInfo();

            await reg.loadFeatures();
            this.checkUserManagement();
        },

        onRegLogout: function () {
            this.username = "";
            this.loggedIn = false;
            this.isAdmin = false;
            this.storageInfo = null;
            this.usersManagement = false;
            this.accountManagement = false;
        },

        logout: async function () {
            try {
                reg.logout();
                await xAuthLogout();
            } catch (e) {
                console.warn('Logout error:', e.message);
            } finally {
                this.login();
            }
        },

        login: function () {
            this.$router.push({ name: "Login" }).catch(() => { });
        },

        toggleUserMenu: function (event) {
            this.$refs.userMenu.toggle(event);
        },

        percent: function (value, places) {
            if (!value) return '';
            return (value * 100).toFixed(places) + '%';
        },
        bytes: function (value) {
            return bytesToSize(value);
        },
        checkUserManagement() {
            const isLocalAuth = reg.getFeature(Features.USER_MANAGEMENT);
            this.usersManagement = isLocalAuth;
            this.accountManagement = isLocalAuth && !HubOptions.disableAccountManagement;
        }
    }
}
</script>

<style scoped>
#header {
    margin: 0;
    padding: var(--ddb-spacing-md);
    width: 100%;
    box-shadow: var(--ddb-shadow-sm);
    display: flex;
    align-items: center;
    z-index: 2;
    gap: var(--ddb-spacing-xs);

    .logo {
        display: flex;
        align-items: center;

        &>img {
            height: 2rem;
        }

        .app-icon {
            font-size: var(--ddb-font-size-lg);
        }

        .app-name {
            font-size: 2rem;
            color: var(--ddb-text);
            font-weight: bold;
            display: inline-block;
        }

        .icon-dronedb {
            margin-right: 1.25rem;
        }
    }

    .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--ddb-spacing-xs);
    }
}

.storage-info-content {
    text-align: center;

    .storage-progress-bar {
        width: var(--ddb-sidebar-width);
        height: var(--ddb-spacing-lg);
        margin: var(--ddb-spacing-lg) auto var(--ddb-spacing-sm) auto;
    }

    .storage-percentage {
        font-size: var(--ddb-font-size-lg);
        font-weight: bold;
        margin-bottom: var(--ddb-spacing-xs);
    }

    .storage-warning {
        margin-top: var(--ddb-spacing-sm);
        color: var(--ddb-danger);
        font-weight: bold;
        font-size: var(--ddb-font-size-base);
    }
}
</style>

<style>
.user-menu-header .p-menuitem-text {
    font-weight: bold !important;
}

#user_menu .p-menuitem-icon {
    width: 1.25rem;
    text-align: center;
    display: inline-flex;
    justify-content: center;
}

.fixed-icon {
    width: 1.25rem;
}
</style>