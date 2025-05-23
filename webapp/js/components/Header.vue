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
                <div>
                    Used {{ storageInfo.used | bytes }} on {{ storageInfo.total | bytes }} total
                    <span v-if="storageInfo.free > 0">, {{ storageInfo.free | bytes }} free</span>
                    <span v-if="storageInfo.free <= 0"><br /><b>No storage left!</b></span>
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
            usersManagement: !!HubOptions.enableUsersManagement
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
        },
        accountManagement: function () {
            return !!HubOptions.enableAccountManagement;
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
        margin-top: 6px;

        &>img {
            height: 22px;
        }

        @media only screen and (max-width: 767px) {
            &>img {
                width: 160px;
                margin-top: 2px;
            }
        }

        .app-icon {
            font-size: 22px;
        }

        .app-name {
            font-size: 22px;
            color: #030a03;
            font-weight: bold;
            display: inline-block;
        }

        .icon-dronedb {
            padding-right: 8px;
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
</style>