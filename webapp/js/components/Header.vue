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

            <a :href="downloadUrl" @click="handleDownload" v-if="showDownload" title="Download"
                class="ui button primary icon download">
                <i :class="{ hidden: !showDownloadIcon }" class="icon download"></i><span
                    :class="{ 'mobile hide': showDownloadIcon }"> {{ downloadLabel }}</span>
            </a>

            <Alert title="Storage Info" v-if="storageInfoDialogOpen" @onClose="handleStorageInfoDialogClose">
                <div class="storage-info-content">
                    <div class="storage-progress-container">
                        <div class="storage-progress-bar" :style="storageBarStyle"></div>
                    </div>
                    <div class="storage-percentage" :style="{ color: storageBarColor }">
                        {{ storageInfo.usedPercentage | percent(1) }}
                    </div>
                    <table style="width: 100%; margin-bottom: 0; margin-top: 1rem; color: #555;">
                        <tr>
                            <th><b>Total</b></th>
                            <th><b>Used</b></th>
                            <th v-if="storageInfo.free > 0"><b>Free</b></th>
                        </tr>
                        <tr>
                            <td>{{ storageInfo.total | bytes }}</td>
                            <td>{{ storageInfo.used | bytes }}</td>
                            <td v-if="storageInfo.free > 0">{{ storageInfo.free | bytes }}</td>
                        </tr>
                    </table>
                    <div v-if="storageInfo.free <= 0" class="storage-warning">
                        <i class="icon warning sign"></i> No storage left!
                    </div>
                </div>
            </Alert>

            <a href="javascript:void(0)" @click="handleSettings" v-if="showSettings" title="Settings"
                class="ui circular button default icon settings">
                <i class="icon wrench"></i>
            </a>
            <button v-if="!loggedIn" class="ui button primary icon" @click="login"><i class="icon lock"></i><span
                    class="mobile hide"> Sign In</span></button>
            <div v-else class="circular ui icon top right pointing dropdown button user-menu" @click.stop="toggleMenu"
                :title="username">
                <i class="icon user"></i>
                <div class="menu" ref="menu">
                    <div class="header">{{ username }} <span v-if="isAdmin && username != 'admin'"> —
                            <i>admin</i></span></div>
                    <div class="divider"></div>
                    <div v-if="fileUploads" class="item" @click="uploadFiles"><i class="icon cloud upload"></i> Upload
                        Files
                    </div>
                    <div class="item" @click="myOrganizations"><i class="icon sitemap"></i> My Organizations</div>
                    <div class="item" @click="myDatasets"><i class="icon database"></i> My Datasets</div>
                    <div class="divider only" v-if="storageInfo"></div>
                    <div class="item only" @click="storageInfoDialogOpen = true"
                        v-if="storageInfo && storageInfo.total != null"><i
                            class="icon hdd outline"></i>&nbsp;{{ storageInfo.usedPercentage | percent(2) }}</div>
                    <div class="item only" v-if="storageInfo && storageInfo.total == null"><i
                            class="icon hdd outline"></i>&nbsp;{{ storageInfo.used | bytes }}</div>
                    <div v-if="(accountManagement && loggedIn) || (usersManagement && isAdmin)" class="divider"></div>
                    <div v-if="accountManagement && loggedIn" class="item only" @click="manageAccount"><i
                            class="icon user"></i>
                        My Account</div>
                    <div v-if="usersManagement && isAdmin" class="item only" @click="manageUsers"><i
                            class="icon users"></i>
                        Manage Users</div>
                    <div class="divider"></div>
                    <div class="item" @click="logout"><i class="icon sign-out"></i> Logout</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { utils } from 'ddb';
import mouse from '../libs/mouse';
import reg from '../libs/sharedRegistry';
import Alert from './Alert';
import { xAuthLogout } from '../libs/xauth';
import { isMobile } from '../libs/responsive';
import { bytesToSize } from '../libs/utils';

export default {
    components: {
        Alert
    },
    data: function () {

        const loggedIn = reg.isLoggedIn();

        return {
            username: reg.getUsername(),
            loggedIn: loggedIn,
            isAdmin: reg.isAdmin(),
            params: this.$route.params,
            showDownload: !!this.$route.params.ds,
            showSettings: loggedIn && !!this.$route.params.ds && !this.$route.params.encodedPath, // TODO: find a better UI design for settings
            selectedFiles: [],
            storageInfo: null,
            storageInfoDialogOpen: false,
            usersManagement: false, // Will be set dynamically based on server configuration
            accountManagement: false // Will be set dynamically based on server configuration and disableAccountManagement option
        }
    },
    filters: {
        percent: function (value, places) {
            if (!value) return ''
            return (value * 100).toFixed(places) + "%";
        },
        bytes: function (value) {
            return bytesToSize(value);
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
        storageBarStyle: function () {
            if (!this.storageInfo || this.storageInfo.usedPercentage == null) return {};
            const pct = Math.min(this.storageInfo.usedPercentage * 100, 100);
            return {
                width: pct + '%',
                backgroundColor: this.storageBarColor
            };
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
                    const dUrl = dataset.downloadUrl(this.selectedFiles.map(f => {
                        const { path } = utils.parseUri(f.path);
                        return path;
                    }));

                    // Browser limit
                    if (dUrl.length < 2000) return dUrl;

                    // We'll use a POST request
                    else return "javascript:void(0)";
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
        }
    },
    mounted: function () {
        mouse.on('click', this.hideMenu);

        reg.addEventListener('login', this.onRegLogin);
        reg.addEventListener('logout', this.onRegLogout);

        this.$root.$on('addItems', () => {
            this.refreshStorageInfo();
        });

        this.$root.$on('deleteEntries', () => {
            this.refreshStorageInfo();
        });

        this.refreshStorageInfo();
        this.checkUserManagement();
    },
    watch: {
        $route: function (to, from) {
            const { params } = to;

            // TODO: we might need have more complex
            // logic in the future to see who has access
            // to download files?
            this.showDownload = !!params.ds;

            // TODO: we need to show this to users that
            // have write access, not everyone
            this.showSettings = reg.isLoggedIn() && !!this.$route.params.ds;

            this.params = params;
        }
    },
    beforeDestroy: function () {
        reg.removeEventListener('login', this.onRegLogin);
        reg.removeEventListener('logout', this.onRegLogout);

        mouse.off('click', this.hideMenu);
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
            if (this.downloadUrl === "javascript:void(0)") {
                const { org, ds } = this.params;
                const dataset = reg.Organization(org).Dataset(ds);

                const { downloadUrl, error } = await dataset.download(this.selectedFiles.map(f => {
                    const { path } = utils.parseUri(f.path);
                    return path;
                }));

                if (error) {
                    // TODO: better error message?
                    alert(error);
                } else {
                    location.href = downloadUrl;
                }
            } else {
                // href will handle it
            }
        },

        handleSettings: function () {
            this.$root.$emit("openSettings");
        },

        onRegLogin: function (username) {
            this.username = username;
            this.loggedIn = true;
        },

        onRegLogout: function () {
            this.username = "";
            this.loggedIn = false;
        },

        logout: async function () {
            reg.logout();
            await xAuthLogout();
            this.login();
        },

        login: function () {
            this.$router.push({ name: "Login" }).catch(() => { });
        },

        toggleMenu: function () {
            if (this.$refs.menu) this.$refs.menu.style.display = this.$refs.menu.style.display === 'block' ?
                'none' :
                'block';
        },

        hideMenu: function () {
            if (this.$refs.menu) this.$refs.menu.style.display = 'none';
        },

        async checkUserManagement() {
            try {
                // Check if user management is enabled on server (i.e., local auth, not external)
                const isLocalAuth = await reg.isUserManagementEnabled();

                // Users management (admin panel) is only available with local auth
                this.usersManagement = isLocalAuth;

                // Account management is enabled when:
                // 1. Authentication is local (not external provider)
                // 2. AND disableAccountManagement is not explicitly set to true
                this.accountManagement = isLocalAuth && !HubOptions.disableAccountManagement;
            } catch (e) {
                console.log('Failed to check user management status:', e.message);
                this.usersManagement = false;
                this.accountManagement = false;
            }
        }
    }
}
</script>

<style scoped>
.alert {
    height: 26px;
    position: relative;
    top: 3px;
    margin-left: 8px;
}

#header {
    margin: 0;
    padding: 8px;
    padding-top: 8px;
    width: 100%;
    box-shadow: 0px 2px 4px -2px #000000;
    display: flex;
    z-index: 2;

    .logo {
        margin-top: 0px;
        display: flex;
        justify-content: center;
        align-items: center;

        &>img {
            height: 33px;
        }

        @media only screen and (max-width: 767px) {
            &>img {
                /*width: 160px;
                margin-top: 2px;*/
            }
        }

        .app-icon {
            font-size: 31px;
        }

        .app-name {
            font-size: 2rem;
            color: #030a03;
            font-weight: bold;
            display: inline-block;
        }

        .icon-dronedb {
            margin-right: 20px;
        }
    }

    .right {
        margin-left: auto;
    }

    .user-menu,
    .settings {
        margin-left: 6px;
    }
}

@media only screen and (min-width: 768px) {
    #header {
        .button.download {
            min-width: 120px;
        }
    }
}

@media only screen and (max-width: 767px) {
    #header {
        .button.download {
            min-width: 38px;
        }
    }
}

.storage-info-content {
    text-align: center;

    .storage-progress-container {
        width: 300px;
        height: 18px;
        background-color: #e8e8e8;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 10px;
        margin-top: 1rem;
    }

    .storage-progress-bar {
        height: 100%;
        border-radius: 10px;
        transition: width 0.4s ease, background-color 0.4s ease;
        min-width: 2%;
    }

    .storage-percentage {
        font-size: 1.6em;
        font-weight: bold;
        margin-bottom: 6px;
    }

    .storage-details {
        display: flex;
        justify-content: space-between;
        color: #555;
        font-size: 0.95em;
    }

    .storage-warning {
        margin-top: 10px;
        color: #db2828;
        font-weight: bold;
        font-size: 1em;
    }
}
</style>