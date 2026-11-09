<template>
    <header id="header">
        <a :href="homeUrl" class="logo">
            <img v-if="appLogo" :src="appLogo" :alt="appName || 'Home'">
            <template v-else>
                <img v-if="appIconUrl" class="app-icon-img" :src="appIconUrl" alt="">
                <i v-else class="app-icon" :class="appIcon" />
                <div v-if="appName" class="app-name">{{ appName }}</div>
            </template>
        </a>

        <nav class="right" aria-label="Main">

            <Button v-if="showBackToOrg" severity="secondary" size="small" text title="Back to organization"
                    aria-label="Back to organization" @click="goToOrganization">
                <i class="fa-solid fa-sitemap" />
            </Button>
            <Button v-if="updateAvailable" class="update-available-btn" size="small" text
                    :title="updateTitle" :aria-label="updateLabel" @click="updateNotesOpen = true">
                <i class="fa-solid fa-circle-arrow-up" aria-hidden="true" />
            </Button>
            <!-- The dataset actions: label, icon, permission, enabled state and what they run come
                 from the explorer's action registry (FR-XC-14); the header places them -->
            <ActionButton v-if="showDownload && onFilesTab && datasetActions.download.visible" severity="secondary" size="small" text
                          :label="datasetActions.download.label" :disabled="!datasetActions.download.enabled"
                          :disabled-reason="datasetActions.download.disabledReason" @click="datasetActions.download.run()">
                <i :class="datasetActions.download.icon" aria-hidden="true" />
                <span v-if="selectedFiles.length > 1" style="line-height: 1;" class="ms-1">{{ selectedFiles.length }}</span>
            </ActionButton>
            <ActionButton v-if="showShare && onFilesTab && datasetActions['share-embed'].visible" severity="secondary" size="small" text
                          :label="datasetActions['share-embed'].label" @click="datasetActions['share-embed'].run()">
                <i :class="datasetActions['share-embed'].icon" aria-hidden="true" />
            </ActionButton>
            <ActionButton v-if="showSettings && datasetActions.settings.visible" severity="secondary" size="small" text
                          :label="datasetActions.settings.label" @click="datasetActions.settings.run()">
                <i :class="datasetActions.settings.icon" aria-hidden="true" />
            </ActionButton>

            <ConfirmDialog v-if="downloadConfirmOpen"
                           title="Download"
                           :message="downloadConfirmMessage"
                           confirm-text="Download"
                           cancel-text="Cancel"
                           confirm-button-class="primary"
                           @close="handleDownloadConfirmClose" />

            <UpdateNotesDialog v-if="updateNotesOpen && updateInfo" :info="updateInfo" @close="updateNotesOpen = false" />

            <PreferencesDialog v-if="preferencesOpen && loggedIn" :initial-tab="preferencesTab" @close="preferencesOpen = false" />

            <Alert v-if="storageInfoDialogOpen" title="Storage Info" @close="handleStorageInfoDialogClose">
                <div class="storage-info-content">
                    <template v-if="storageInfo.used > 0">
                        <ProgressBar :value="storagePercent" :show-value="false"
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
                        <PrimeMessage v-if="storageInfo.free <= 0" severity="error" :closable="false" icon="fa-solid fa-triangle-exclamation" size="small">
                            No storage left!
                        </PrimeMessage>
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

            <Button v-if="!loggedIn" size="small" title="Sign In" aria-label="Sign In" @click="login">
                <i class="fa-solid fa-lock" /><span class="d-none d-sm-inline ms-1">Sign In</span>
            </Button>
            <Button v-else severity="secondary" size="small" text
                    :title="username" aria-haspopup="true" aria-controls="user_menu" @click="toggleUserMenu">
                <i class="fa-solid fa-user" />
            </Button>
            <Menu id="user_menu" ref="userMenu" :model="userMenuItems" :popup="true" :pt="userMenuPt" />
        </nav>

        <ShareEmbed v-if="shareFile" :file="shareFile" @close="handleCloseShareEmbed" />
    </header>
</template>

<script>
import { utils } from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import Alert from '@/components/HubAlert';
import ActionButton from '@/components/ActionButton.vue';
import ConfirmDialog from '@/components/ConfirmDialog';
import ShareEmbed from '@/features/dataset/ShareEmbed.vue';
import { lazyComponent } from '@/libs/lazyComponent';
import { xAuthLogout } from '@/libs/api/xauth';
import { bytesToSize } from '@/libs/utils';
import emitter from '@/libs/eventBus';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import ProgressBar from 'primevue/progressbar';
import PrimeMessage from 'primevue/message';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useUpdateCheck } from '@/composables/useUpdateCheck';
import { mapState } from 'pinia';
import { isNavigationFailure, NavigationFailureType } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { loginLocation, PREFERENCES_QUERY } from '@/libs/authRoutes';
import { currentLocation, currentPath } from '@/libs/routeQuery';
import { downloadFromDataset, notifyDownloadError } from '@/libs/datasetDownloads';
import { resolveAction } from '@/libs/dataset/explorerActions';

// The dataset actions of the header, in the registry (libs/dataset/explorerActions.js)
const HEADER_ACTIONS = Object.freeze(['download', 'share-embed', 'settings']);

// Opened from the user menu only: its code loads the first time it is shown
// Lazy: the release notes need the markdown renderer, which only admins who open them should load
const UpdateNotesDialog = lazyComponent(() => import(/* webpackChunkName: "admin" */ '@/features/admin/UpdateNotesDialog.vue'));
const PreferencesDialog = lazyComponent(() => import(/* webpackChunkName: "account" */ '@/features/account/PreferencesDialog.vue'));

export default {
    name: 'HubHeader',
    components: {
        ActionButton,
        Alert,
        ConfirmDialog,
        ShareEmbed,
        UpdateNotesDialog,
        PreferencesDialog,
        Button,
        Menu,
        ProgressBar,
        PrimeMessage
    },
    setup() {
        const { runHeavyTask } = useHeavyTask();
        const { updateInfo, updateAvailable, enabled: updateCheckActive, load: loadUpdateInfo } = useUpdateCheck();
        return { runHeavyTask, updateInfo, updateAvailable, updateCheckActive, loadUpdateInfo };
    },
    data: function () {

        return {
            params: this.$route.params,
            // Where the dataset actions go (a dataset page); who may use them is the registry's rule
            showDownload: !!this.$route.params.ds,
            showShare: !!this.$route.params.ds,
            showSettings: !!this.$route.params.ds && !this.$route.params.encodedPath,
            showBackToOrg: false,
            orgInfoCache: {},
            isDownloading: false,
            downloadConfirmOpen: false,
            storageInfo: null,
            storageInfoDialogOpen: false,
            usersManagement: false,
            accountManagement: false,
            shareFile: null,
            updateNotesOpen: false,
            preferencesOpen: false,
            // The tab the window opens on (undefined: its first)
            preferencesTab: undefined
        }
    },

    computed: {
        // The popup menu is rendered in <body>: styled through pass-through, not global CSS
        userMenuPt: function () {
            return {
                // An item's ariaLabel replaces the label as its accessible name
                item: ({ context }) => (context.item?.ariaLabel ? { 'aria-label': context.item.ariaLabel } : {}),
                itemIcon: { style: { width: '1.25rem', display: 'inline-flex', justifyContent: 'center' } },
                itemLabel: ({ context }) => (context.item?.class === 'user-menu-header' ? { style: { fontWeight: 'bold' } } : {})
            };
        },
        ...mapState(useAuthStore, { username: 'username', loggedIn: 'isLoggedIn', isAdmin: 'isAdmin', featuresVersion: 'featuresVersion' }),
        // `unavailable`: the dataset did not load (ResourceState), so it has no Download, Share or Settings
        ...mapState(useDatasetSessionStore, ['selectedFiles', 'activeTab', 'activeBulkDownload', 'unavailable', 'canWrite']),
        // Download, Share/Embed and Settings as the registry resolves them for the dataset and the
        // selection (the 'header' surface: shown where they apply, Download disabled with its reason)
        datasetActions: function () {
            const ctx = {
                getSelectedEntries: () => this.selectedFiles,
                canWrite: this.canWrite,
                signedIn: this.loggedIn,
                unavailable: this.unavailable,
                downloadInProgress: () => this.isDownloading || this.activeBulkDownload,
                emit: (event, ...args) => {
                    if (event === 'downloadItems') this.downloadConfirmOpen = true;
                    else if (event === 'shareEmbed') this.shareFile = args[0];
                    else if (event === 'settings') useDatasetSessionStore().requestSettings();
                }
            };
            return Object.fromEntries(HEADER_ACTIONS.map(id => [id, resolveAction(id, ctx, 'header')]));
        },
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
            return null;
        },

        fileUploads: function () {
            return !HubOptions.disableDatasetCreation;
        },

        appLogo: function () {
            // Honour an explicit AppLogo when configured.
            if (HubOptions.appLogo !== undefined) return HubOptions.appLogo;

            // Otherwise, fall back to the bundled logo-banner ONLY when no
            // other branding is configured. If the operator has set AppIcon
            // and/or AppName, render those via the v-else template instead.
            if (HubOptions.appIcon === undefined && HubOptions.appName === undefined) {
                return "/images/logo-banner.svg";
            }
            return null;
        },
        appIcon: function () {
            return (HubOptions.appIcon === "dronedb" || HubOptions.appIcon === undefined) ?
                "icon-dronedb" :
                `icon ${HubOptions.appIcon}`;
        },
        appIconUrl: function () {
            // When AppIcon is a URL or absolute/relative path (starts with
            // "/", "http://", "https://" or "data:"), render it as an <img>
            // instead of treating it as a CSS icon class.
            const v = HubOptions.appIcon;
            if (typeof v !== "string") return null;
            if (/^(https?:|data:|\/)/.test(v)) return v;
            return null;
        },
        appName: function () {
            // No hardcoded fallback: when AppName is not configured the
            // logo banner alone is shown (the banner already carries the
            // wordmark).
            return HubOptions.appName !== undefined ? HubOptions.appName : null;
        },
        updateTitle: function () {
            const { latestVersion, currentVersion } = this.updateInfo;
            return `Registry ${latestVersion} is available (current: ${currentVersion}) - what's new`;
        },
        updateLabel: function () {
            return `Registry ${this.updateInfo.latestVersion} is available, show what's new`;
        },
        downloadConfirmMessage: function () {
            if (this.selectedFiles.length > 0) {
                return `Are you sure you want to download ${this.selectedFiles.length} selected file${this.selectedFiles.length !== 1 ? 's' : ''}?`;
            }
            return 'Are you sure you want to download the entire dataset?';
        },
        // Download/Share toolbar actions are only meaningful on the file-listing
        // tabs (Files explorer, or the mobile FileBrowser). They are hidden on
        // Map/Tasks/Properties to avoid acting on a stale selection.
        onFilesTab: function () {
            return this.activeTab === 'explorer' || this.activeTab === 'filebrowser';
        },
        userMenuItems: function () {
            const items = [];

            items.push({ label: this.username + (this.isAdmin && this.username !== 'admin' ? ' - admin' : ''), disabled: true, class: 'user-menu-header' });
            items.push({ separator: true });

            if (this.fileUploads)
                items.push({ label: 'Upload Files', icon: 'fa-solid fa-cloud-arrow-up', command: () => this.uploadFiles() });

            items.push({ label: 'My Organizations', icon: 'fa-solid fa-sitemap', command: () => this.myOrganizations() });
            items.push({ label: 'My Datasets', icon: 'fa-solid fa-database', command: () => this.myDatasets() });

            if (this.storageInfo) {
                items.push({ separator: true });
                // The row shows a bare number: its name says what the number is
                const storage = (label, ariaLabel, command = () => {}) => ({ label, ariaLabel, icon: 'fa-regular fa-hard-drive', command });
                if (this.storageInfo.total != null && this.storageInfo.used > 0) {
                    const used = this.percent(this.storageInfo.usedPercentage, 2);
                    items.push(storage(used, `Storage: ${used} used`, () => { this.storageInfoDialogOpen = true; }));
                } else if (this.storageInfo.total != null && !this.storageInfo.used) {
                    const total = this.bytes(this.storageInfo.total);
                    items.push(storage(total, `Storage: ${total} total, none used`));
                } else if (this.storageInfo.total == null) {
                    const used = this.bytes(this.storageInfo.used);
                    items.push(storage(used, `Storage: ${used} used`));
                }
            }

            if (this.loggedIn || (this.usersManagement && this.isAdmin) || this.isAdmin) {
                items.push({ separator: true });
            }
            if (this.accountManagement && this.loggedIn) {
                items.push({ label: 'My Account', icon: 'fa-solid fa-user', command: () => this.manageAccount() });
            }
            if (this.loggedIn) {
                items.push({ label: 'Preferences', icon: 'fa-solid fa-sliders', command: () => this.openPreferences() });
            }
            if (this.usersManagement && this.isAdmin) {
                items.push({ label: 'Manage Users', icon: 'fa-solid fa-users', command: () => this.manageUsers() });
            }
            if (this.isAdmin) {
                items.push({ label: 'Tasks', icon: 'fa-solid fa-list-check', command: () => this.adminTasks() });
                items.push({ separator: true });
                items.push({ label: 'Configuration', icon: 'fa-solid fa-gear', command: () => this.adminConfig() });
                items.push({ label: 'Hangfire', icon: 'fa-solid fa-fire', url: '/hangfire', target: '_blank', rel: 'noopener' });
                items.push({ label: 'API Docs', icon: 'fa-solid fa-code', url: '/scalar/v1', target: '_blank', rel: 'noopener' });
            }

            items.push({ separator: true });
            items.push({ label: 'Logout', icon: 'fa-solid fa-right-from-bracket', command: () => this.logout() });

            return items;
        }
    },
    watch: {
        loggedIn: function (loggedIn) {
            if (loggedIn) {
                this.refreshStorageInfo();
                this.openPreferencesFromLink();
            } else {
                this.storageInfo = null;
                this.updateNotesOpen = false;
                this.preferencesOpen = false;
                this.usersManagement = false;
                this.accountManagement = false;
            }
        },
        featuresVersion: function () {
            this.checkUserManagement();
        },
        // An admin signs in, or the feature flags arrive: ask for the update info (once per session)
        updateCheckActive: {
            immediate: true,
            handler: function (active) {
                if (active) this.loadUpdateInfo();
            }
        },
        $route: function (to) {
            const { params } = to;

            this.showDownload = !!params.ds;
            this.showShare = !!params.ds;
            this.showSettings = !!this.$route.params.ds;

            // Off the dataset page there is no selection, tab or archive in progress
            if (!params.ds) useDatasetSessionStore().reset();

            this.params = params;
            this.updateBackToOrgVisibility();
            this.openPreferencesFromLink();
        }
    },
    mounted: function () {

        this._onAddItems = () => {
            this.refreshStorageInfo();
        };
        this._onDeleteEntries = () => {
            this.refreshStorageInfo();
        };
        emitter.on('addItems', this._onAddItems);
        emitter.on('deleteEntries', this._onDeleteEntries);


        this.refreshStorageInfo();
        this.checkUserManagement();
        this.updateBackToOrgVisibility();
        this.openPreferencesFromLink();
    },
    beforeUnmount: function () {

        emitter.off('addItems', this._onAddItems);
        emitter.off('deleteEntries', this._onDeleteEntries);
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
                    // The user did not ask for it: an anonymous visitor of a shared dataset of a
                    // private organization gets a 401 here, which only hides the button (FR-XC-05)
                    orgInfo = await reg.Organization(org).info({ skipUnauthorized: true });
                    this.orgInfoCache[org] = orgInfo;
                }
                this.showBackToOrg = orgInfo.isPublic || (orgInfo.permissions && orgInfo.permissions.canRead);
            } catch {
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
        adminTasks: function () {
            this.$router.push({ name: "AdminTasks" });
        },
        adminConfig: function () {
            this.$router.push({ name: "AdminConfig" });
        },
        manageAccount: function () {
            this.$router.push({ name: "Account" });
        },
        /** @param {string} [tab] the tab to show first */
        openPreferences: function (tab) {
            this.preferencesTab = tab;
            this.preferencesOpen = true;
        },

        // A link with ?preferences=<tab> (e.g. the opt-out link of an e-mail) opens the window on
        // that tab, then leaves the URL as it would be without it, so a reload or a shared URL does
        // not open it again. The router guard signs an anonymous user in first, keeping the link.
        // The query and the hash come from the address bar, not $route: a map writes its layers
        // and its Plant Health hash without a navigation, and $route would put the old ones back.
        openPreferencesFromLink: function () {
            const { query, hash } = currentLocation();
            const { path } = this.$route;
            if (!this.loggedIn || !Object.hasOwn(query, PREFERENCES_QUERY)) return;
            const { [PREFERENCES_QUERY]: tab, ...rest } = query;
            this.openPreferences(typeof tab === 'string' && tab ? tab : undefined);
            this.$router.replace({ path, query: rest, hash }).catch(() => { });
        },
        handleDownloadConfirmClose: async function (action) {
            this.downloadConfirmOpen = false;

            if (action !== 'confirm') return;
            if (this.isDownloading) return;
            if (this.activeBulkDownload) return;

            const { org, ds } = this.params;
            const dataset = reg.Organization(org).Dataset(ds);

            const paths = this.selectedFiles.length > 0
                ? this.selectedFiles.map(f => {
                    const { path } = utils.parseUri(f.path);
                    return path;
                })
                : undefined;

            this.isDownloading = true;
            try {
                await downloadFromDataset({
                    dataset, paths, files: this.selectedFiles,
                    signedIn: this.loggedIn,
                    thresholdBytes: reg.features.value(Features.BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES),
                    runTask: this.runHeavyTask
                });
            } catch (err) {
                notifyDownloadError(err);
            } finally {
                this.isDownloading = false;
            }
        },

        handleCloseShareEmbed: function () {
            this.shareFile = null;
        },

        // To Login first: a page with unsaved edits asks, and Cancel keeps the page and the
        // session. The session ends once nothing stops the navigation, before Login shows (Login
        // sends a signed-in user back to where they came from).
        logout: async function () {
            let signedOut = false;
            const endSession = () => {
                if (signedOut) return;
                signedOut = true;
                try {
                    useAuthStore().logout();
                } catch (e) {
                    console.warn('Logout error:', e.message);
                }
            };
            const removeHook = this.$router.beforeResolve(to => {
                if (to.name !== 'Login') return;
                removeHook();
                endSession();
            });
            let failure;
            try {
                failure = await this.$router.push(loginLocation(currentPath()));
            } catch (e) {
                failure = e;
            } finally {
                removeHook();
            }
            // Already on that address (nothing to leave), or Login could not be reached (its code
            // did not load): sign out all the same. Only a guard's Cancel keeps the session.
            if (isNavigationFailure(failure, NavigationFailureType.duplicated) || (failure instanceof Error && !isNavigationFailure(failure))) {
                if (!signedOut) console.warn('Logout error:', failure.message);
                endSession();
            }
            if (!signedOut) return;
            try {
                await xAuthLogout();
            } catch (e) {
                console.warn('Logout error:', e.message);
            }
        },

        login: function () {
            // Back to the address as it is now, with what a map wrote without a navigation
            this.$router.push(loginLocation(currentPath())).catch(() => { });
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
            const isLocalAuth = reg.features.get(Features.USER_MANAGEMENT);
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
        /* A tap target of 2rem, whatever the height of the logo */
        min-height: 2rem;
        text-decoration: none;

        &>img {
            height: 2rem;
        }

        .app-icon {
            font-size: var(--ddb-font-size-lg);
        }

        .app-icon-img {
            height: 2rem;
            margin-right: 0.5rem;
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

    @media screen and (max-width: 767.98px) {
        .logo > img {
            height: 1.5rem;
            max-width: 8rem;
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
}
</style>
