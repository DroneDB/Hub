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

            <Button :href="downloadUrl" @click="handleDownload" v-if="showDownload" title="Download"
                severity="info" :loading="isDownloading" :disabled="isDownloading" size="small">
                <i :class="{ hidden: !showDownloadIcon }" class="fa-solid fa-download"></i><span
                    :class="{ 'mobile hide': showDownloadIcon }"> {{ downloadLabel }}</span>
            </Button>

            <Alert title="Storage Info" v-if="storageInfoDialogOpen" @onClose="handleStorageInfoDialogClose">
                <div class="storage-info-content">
                    <template v-if="storageInfo.used > 0">
                        <ProgressBar :value="storagePercent" :showValue="false"
                            :pt="{ value: { style: { background: storageBarColor } } }"
                            style="width: 300px; height: 18px; margin: 1rem auto 10px auto;" />
                        <div class="storage-percentage" :style="{ color: storageBarColor }">
                            {{ percent(storageInfo.usedPercentage, 1) }}
                        </div>
                        <table style="width: 100%; margin-bottom: 0; margin-top: 1rem; color: #555;">
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
                        <table style="width: 100%; margin-bottom: 0; color: #555;">
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

            <Button @click="handleSettings" v-if="showSettings" title="Settings"
                severity="secondary" size="small" text>
                <i class="fa-solid fa-wrench"></i>
            </Button>
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
import reg from '../libs/sharedRegistry';
import { Features } from '../libs/features';
import Alert from './Alert';
import { xAuthLogout } from '../libs/xauth';
import { isMobile } from '../libs/responsive';
import { bytesToSize } from '../libs/utils';
import emitter from '../libs/eventBus';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import ProgressBar from 'primevue/progressbar';

export default {
    components: {
        Alert,
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
            selectedFiles: [],
            isDownloading: false,
            storageInfo: null,
            storageInfoDialogOpen: false,
            usersManagement: false,
            accountManagement: false
        }
    },

    computed: {
        storageBarColor: function () {
            if (!this.storageInfo || this.storageInfo.usedPercentage == null) return '#21ba45';
            const pct = this.storageInfo.usedPercentage * 100;
            if (pct >= 90) return '#db2828';
            if (pct >= 70) return '#f2711c';
            if (pct >= 50) return '#fbbd08';
            return '#21ba45';
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
        userMenuItems: function () {
            const items = [];

            items.push({ label: this.username + (this.isAdmin && this.username !== 'admin' ? ' — admin' : ''), disabled: true, class: 'user-menu-header' });
            items.push({ separator: true });

            if (this.fileUploads)
                items.push({ label: 'Upload Files', icon: 'fa-solid fa-cloud-arrow-up', command: () => this.uploadFiles() });

            items.push({ label: 'My Organizations', icon: 'fa-solid fa-sitemap', command: () => this.myOrganizations() });
            items.push({ label: 'My Datasets', icon: 'fa-solid fa-database', command: () => this.myDatasets() });

            if (this.storageInfo) {
                items.push({ separator: true });
                if (this.storageInfo.total != null && this.storageInfo.used > 0) {
                    items.push({ label: this.percent(this.storageInfo.usedPercentage, 2), icon: 'fa-regular fa-hard-drive', command: () => { this.storageInfoDialogOpen = true; } });
                } else if (this.storageInfo.total != null && !this.storageInfo.used) {
                    items.push({ label: this.bytes(this.storageInfo.total), icon: 'fa-regular fa-hard-drive', command: () => {} });
                } else if (this.storageInfo.total == null) {
                    items.push({ label: this.bytes(this.storageInfo.used), icon: 'fa-regular fa-hard-drive', command: () => {} });
                }
            }

            if ((this.accountManagement && this.loggedIn) || (this.usersManagement && this.isAdmin)) {
                items.push({ separator: true });
            }
            if (this.accountManagement && this.loggedIn) {
                items.push({ label: 'My Account', icon: 'fa-solid fa-user', command: () => this.manageAccount() });
            }
            if (this.usersManagement && this.isAdmin) {
                items.push({ label: 'Manage Users', icon: 'fa-solid fa-users', command: () => this.manageUsers() });
            }

            items.push({ separator: true });
            items.push({ label: 'Logout', icon: 'fa-solid fa-right-from-bracket', command: () => this.logout() });

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
    },
    watch: {
        $route: function (to, from) {
            const { params } = to;

            this.showDownload = !!params.ds;
            this.showSettings = reg.isLoggedIn() && !!this.$route.params.ds;

            this.params = params;
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
        handleDownload: async function (e) {
            e.preventDefault();

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
    padding: 0.5rem;
    width: 100%;
    box-shadow: 0 0.125rem 0.25rem -0.125rem #000000;
    display: flex;
    align-items: center;
    z-index: 2;
    gap: 0.375rem;

    .logo {
        display: flex;
        align-items: center;

        &>img {
            height: 2.0625rem;
        }

        .app-icon {
            font-size: 1.9375rem;
        }

        .app-name {
            font-size: 2rem;
            color: #030a03;
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
        gap: 0.375rem;
    }
}

.storage-info-content {
    text-align: center;

    .storage-percentage {
        font-size: 1.6em;
        font-weight: bold;
        margin-bottom: 0.375rem;
    }

    .storage-warning {
        margin-top: 0.625rem;
        color: #db2828;
        font-weight: bold;
        font-size: 1em;
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
</style>