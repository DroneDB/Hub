<template>
    <header id="header">
        <!-- Home without a reload: the same place as after sign-in (FR-NAV-06) -->
        <RouterLink :to="homeTarget" class="logo">
            <img v-if="appLogo" :src="appLogo" :alt="appName || 'Home'">
            <template v-else>
                <img v-if="appIconUrl" class="app-icon-img" :src="appIconUrl" alt="">
                <i v-else class="app-icon" :class="appIcon" />
                <div v-if="appName" class="app-name">{{ appName }}</div>
            </template>
        </RouterLink>

        <!-- The main destinations, always in view; the current one says so (aria-current) (FR-NAV-01) -->
        <nav v-if="primaryNav.length > 0" class="primary-nav" aria-label="Main">
            <RouterLink v-for="link in primaryNav" :key="link.id" :to="link.to" class="primary-nav-link" :data-nav="link.id"
                        :title="link.label">
                <i :class="link.icon" aria-hidden="true" /><span class="primary-nav-label">{{ link.label }}</span>
            </RouterLink>
        </nav>

        <!-- Where the user is: Organizations / organization / dataset (FR-NAV-03, FR-NAV-04) -->
        <HubBreadcrumb v-if="params.org" class="header-crumbs" :org="String(params.org)" :ds="params.ds ? String(params.ds) : ''" />

        <nav class="right" aria-label="Page actions and account">

            <!-- The uploads of the dataset page go on while the user is on another page (FR-UPL-04) -->
            <UploadIndicator />

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
                <span class="header-action-label d-none d-md-inline">{{ SHORT_LABELS.download }}</span>
                <span v-if="selectedFiles.length > 1" style="line-height: 1;" class="ms-1">{{ selectedFiles.length }}</span>
            </ActionButton>
            <ActionButton v-if="showShare && onFilesTab && datasetActions['share-embed'].visible" severity="secondary" size="small" text
                          :label="datasetActions['share-embed'].label" @click="datasetActions['share-embed'].run()">
                <i :class="datasetActions['share-embed'].icon" aria-hidden="true" />
                <span class="header-action-label d-none d-md-inline">{{ SHORT_LABELS['share-embed'] }}</span>
            </ActionButton>
            <ActionButton v-if="showSettings && datasetActions.settings.visible" severity="secondary" size="small" text
                          :label="datasetActions.settings.label" @click="datasetActions.settings.run()">
                <i :class="datasetActions.settings.icon" aria-hidden="true" />
                <span class="header-action-label d-none d-md-inline">{{ SHORT_LABELS.settings }}</span>
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

            <!-- What the storage is, whatever its shape: a quota with its bar (the real percentage), or no quota (FR-ACC-11, FR-ACC-17) -->
            <Alert v-if="storageInfoDialogOpen && storageNow" title="Storage Info" @close="handleStorageInfoDialogClose">
                <div class="storage-info-content">
                    <p v-if="storageNow.unlimited" class="storage-unlimited">{{ storageNow.label }}</p>
                    <template v-else>
                        <ProgressBar :value="storageNow.barValue" :show-value="false"
                                     aria-label="Storage used" :aria-valuetext="`${storageNow.percentText} used`"
                                     :pt="{ value: { style: { background: storageNow.color } } }"
                                     class="storage-progress-bar" />
                        <div class="storage-percentage" :style="{ color: storageNow.color }">
                            {{ storageNow.percentText }}
                        </div>
                        <table style="width: 100%; margin-bottom: 0; margin-top: 1rem; color: var(--ddb-text-secondary);">
                            <thead><tr>
                                <th><b>Total</b></th>
                                <th><b>Used</b></th>
                                <th><b>Free</b></th>
                            </tr></thead>
                            <tbody><tr>
                                <td>{{ storageNow.totalText }}</td>
                                <td>{{ storageNow.usedText }}</td>
                                <td>{{ bytes(storageNow.free) }}</td>
                            </tr></tbody>
                        </table>
                        <PrimeMessage v-if="storageNow.message" :severity="storageNow.severity === 'over' ? 'error' : 'warn'" :closable="false"
                                      icon="fa-solid fa-triangle-exclamation" size="small" class="mt-2">
                            {{ storageNow.message }}
                        </PrimeMessage>
                    </template>
                </div>
            </Alert>

            <!-- Not on Login itself: there it would start again without the page to come back to -->
            <Button v-if="!loggedIn && !onLoginRoute" size="small" title="Sign In" aria-label="Sign In" @click="login">
                <i class="fa-solid fa-lock" /><span class="d-none d-sm-inline ms-1">Sign In</span>
            </Button>
            <!-- The user, named from md up, and the role of an administrator -->
            <Button v-else-if="loggedIn" class="user-menu-button" severity="secondary" size="small" text
                    :title="username" :aria-label="`Account menu for ${username}`" aria-haspopup="true" :aria-expanded="menuOpen"
                    aria-controls="user_menu" @click="toggleUserMenu">
                <i class="fa-solid fa-user" aria-hidden="true" />
                <span class="user-name d-none d-md-inline">{{ username }}</span>
                <span v-if="isAdmin" class="user-role d-none d-md-inline">Admin</span>
            </Button>
            <Menu id="user_menu" ref="userMenu" :model="userMenuItems" :popup="true" :pt="userMenuPt" @show="menuOpen = true" @hide="onMenuHide" />
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
import HubBreadcrumb from '@/components/HubBreadcrumb.vue';
import UploadIndicator from '@/layout/UploadIndicator.vue';
import ConfirmDialog from '@/components/ConfirmDialog';
import ShareEmbed from '@/features/dataset/ShareEmbed.vue';
import { lazyComponent } from '@/libs/lazyComponent';
import { xAuthLogout } from '@/libs/api/xauth';
import { bytesToSize } from '@/libs/utils';
import { storageUsage } from '@/libs/storageUsage';
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
import { homeLocation, loginLocation, PREFERENCES_QUERY } from '@/libs/authRoutes';
import { currentLocation, currentPath } from '@/libs/routeQuery';
import { downloadFromDataset, notifyDownloadError, needsConfirm, confirmMessage } from '@/libs/datasetDownloads';
import { describeSelection, selectionSize } from '@/libs/dataset/selection';
import { resolveAction } from '@/libs/dataset/explorerActions';
import { userMenuItems, primaryNavItems } from '@/libs/userMenuItems';

// The dataset actions of the header, in the registry (libs/dataset/explorerActions.js)
const HEADER_ACTIONS = Object.freeze(['download', 'share-embed', 'settings']);
// What each shows beside its icon from md up (FR-NAV-04); the accessible name stays the registry's label
// ('Download entire dataset' contains 'Download')
const SHORT_LABELS = Object.freeze({ download: 'Download', 'share-embed': 'Share', settings: 'Settings' });

// Opened from the user menu only: its code loads the first time it is shown
// Lazy: the release notes need the markdown renderer, which only admins who open them should load
const UpdateNotesDialog = lazyComponent(() => import(/* webpackChunkName: "admin" */ '@/features/admin/UpdateNotesDialog.vue'));
const PreferencesDialog = lazyComponent(() => import(/* webpackChunkName: "account" */ '@/features/account/PreferencesDialog.vue'));

export default {
    name: 'HubHeader',
    components: {
        ActionButton,
        HubBreadcrumb,
        UploadIndicator,
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
    // The versions of the software that runs (from /sys/features, provided by main.js), for the administrator's menu
    inject: { versions: { from: 'versions', default: () => ({}) } },
    setup() {
        const { runHeavyTask } = useHeavyTask();
        const { updateInfo, updateAvailable, enabled: updateCheckActive, load: loadUpdateInfo } = useUpdateCheck();
        return { runHeavyTask, updateInfo, updateAvailable, updateCheckActive, loadUpdateInfo, SHORT_LABELS };
    },
    data: function () {

        return {
            params: this.$route.params,
            // Where the dataset actions go (a dataset page); who may use them is the registry's rule
            showDownload: !!this.$route.params.ds,
            showShare: !!this.$route.params.ds,
            showSettings: !!this.$route.params.ds && !this.$route.params.encodedPath,
            isDownloading: false,
            downloadConfirmOpen: false,
            // The size of a selection with a folder, read while the question is open (null: not yet)
            downloadSize: null,
            downloadSizeFailed: false,
            // Stops that reading when the question closes
            stopSizeReading: null,
            storageInfo: null,
            storageInfoDialogOpen: false,
            // The user menu is open (aria-expanded of its button)
            menuOpen: false,
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
                itemLabel: ({ context }) => {
                    const cls = context.item?.class ?? '';
                    if (cls === 'user-menu-header') return { style: { fontWeight: 'bold' } };
                    // A storage row from 90 % of the quota is amber, from 100 % red (D-030)
                    if (cls.includes('user-menu-storage-over')) return { style: { color: 'var(--ddb-danger)', fontWeight: 'bold' } };
                    if (cls.includes('user-menu-storage-warn')) return { style: { color: 'var(--ddb-warning)', fontWeight: 'bold' } };
                    return {};
                }
            };
        },
        ...mapState(useAuthStore, { username: 'username', loggedIn: 'isLoggedIn', isAdmin: 'isAdmin', featuresVersion: 'featuresVersion' }),
        // `unavailable`: the dataset did not load (ResourceState), so it has no Download, Share or Settings
        ...mapState(useDatasetSessionStore, ['selectedFiles', 'activeTab', 'activeBulkDownload', 'unavailable', 'canWrite', 'rootEntry']),
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
                    // A single file downloads at once; an archive asks first (FR-EXP-27)
                    if (event === 'downloadItems') {
                        if (needsConfirm(this.selectedFiles)) this.askDownload();
                        else this.startDownload();
                    }
                    else if (event === 'shareEmbed') this.shareFile = args[0];
                    else if (event === 'settings') useDatasetSessionStore().requestSettings();
                }
            };
            return Object.fromEntries(HEADER_ACTIONS.map(id => [id, resolveAction(id, ctx, 'header')]));
        },
        // The state of the storage quota, from the one helper (libs/storageUsage.js); null until it is read
        storageNow: function () {
            return this.storageInfo ? storageUsage(this.storageInfo.used, this.storageInfo.total) : null;
        },
        homeTarget: function () {
            return homeLocation();
        },
        onLoginRoute: function () {
            return this.$route.name === 'Login' || this.$route.name === 'LoginHome';
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
        // The size and the count of the question: the selection's, or the dataset's root entry's
        downloadConfirmMessage: function () {
            const root = this.rootEntry;
            return confirmMessage(describeSelection(this.selectedFiles), { count: root?.properties?.entries, size: root?.size },
                { size: this.downloadSize, failed: this.downloadSizeFailed });
        },
        // Download/Share toolbar actions are only meaningful on the file-listing
        // tabs (Files explorer, or the mobile FileBrowser). They are hidden on
        // Map/Tasks/Properties to avoid acting on a stale selection.
        onFilesTab: function () {
            return this.activeTab === 'explorer' || this.activeTab === 'filebrowser';
        },
        // The user menu in labelled groups (libs/userMenuItems.js); the header only says what each entry does
        userMenuItems: function () {
            return userMenuItems({
                loggedIn: this.loggedIn,
                username: this.username,
                isAdmin: this.isAdmin,
                accountManagement: this.accountManagement,
                usersManagement: this.usersManagement,
                storage: this.storageInfo,
                versions: this.versions,
                run: {
                    myDatasets: () => this.myDatasets(),
                    storage: () => { this.storageInfoDialogOpen = true; },
                    account: () => this.manageAccount(),
                    preferences: () => this.openPreferences(),
                    users: () => this.manageUsers(),
                    tasks: () => this.adminTasks(),
                    config: () => this.adminConfig(),
                    logout: () => this.logout()
                }
            });
        },
        // Organizations and Upload, as links of the header
        primaryNav: function () {
            return primaryNavItems({ loggedIn: this.loggedIn, fileUploads: this.fileUploads, home: this.homeTarget });
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
        this.openPreferencesFromLink();
    },
    beforeUnmount: function () {

        emitter.off('addItems', this._onAddItems);
        emitter.off('deleteEntries', this._onDeleteEntries);
        this.stopDownloadSizeReading();
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
        // The session may have gone since the menu was drawn (cleared storage, a sign-out
        // elsewhere): then the header catches up and the user signs in again, coming back here.
        // No notice: nothing says the session expired (FR-ACC-08)
        myDatasets: function () {
            if (!this.username || !reg.isLoggedIn()) {
                useAuthStore().sync();
                this.$router.push(loginLocation(currentPath())).catch(() => { });
                return;
            }
            // A one-organization install: its datasets are home
            const home = homeLocation();
            const target = home.name === 'Datasets' ? home : { name: 'Datasets', params: { org: this.username } };
            this.$router.push(target);
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
        // Asks before an archive download. A folder's size is read from the server meanwhile
        // ("Calculating size…"), as the delete question does; the user can answer before it arrives.
        askDownload: function () {
            this.stopDownloadSizeReading();
            this.downloadSize = null;
            this.downloadSizeFailed = false;
            if (describeSelection(this.selectedFiles).hasFolder) {
                const { org, ds } = this.params;
                const reading = new AbortController();
                this.stopSizeReading = () => reading.abort();
                selectionSize(reg.Organization(org).Dataset(ds), this.selectedFiles, { signal: reading.signal })
                    .then(total => { if (!reading.signal.aborted) this.downloadSize = total; })
                    .catch(e => {
                        if (reading.signal.aborted) return;
                        this.downloadSizeFailed = true;
                        console.warn('Cannot read the size of the selection:', e);
                    });
            }
            this.downloadConfirmOpen = true;
        },
        stopDownloadSizeReading: function () {
            if (this.stopSizeReading) this.stopSizeReading();
            this.stopSizeReading = null;
        },
        handleDownloadConfirmClose: function (action) {
            this.downloadConfirmOpen = false;
            this.stopDownloadSizeReading();
            if (action === 'confirm') return this.startDownload();
        },

        startDownload: async function () {
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
            // On Login already: keep the page it returns to. Elsewhere: back to the address as it
            // is now, with what a map wrote without a navigation
            const redirect = this.onLoginRoute ? this.$route.query?.redirect : currentPath();
            this.$router.push(loginLocation(typeof redirect === 'string' ? redirect : undefined)).catch(() => { });
        },

        toggleUserMenu: function (event) {
            this.$refs.userMenu.toggle(event);
        },

        // The menu closed. When it closed while its list had the focus (Tab, or Escape) the list is gone with
        // the menu, and the focus would be lost: it goes back to the button, from where Tab moves on (FR-ACC-20)
        onMenuHide: function () {
            this.menuOpen = false;
            const container = this.$refs.userMenu?.container;
            const button = this.$el?.querySelector?.('.user-menu-button');
            if (container && button && container.contains(document.activeElement)) button.focus();
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
    flex-wrap: wrap;
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

    /* Organizations and Upload: icons on a phone, with their names from sm */
    .primary-nav {
        display: flex;
        align-items: center;
        gap: var(--ddb-spacing-xs);
        margin-left: var(--ddb-spacing-sm);
    }

    .primary-nav-link {
        display: inline-flex;
        align-items: center;
        gap: var(--ddb-spacing-xs);
        min-height: 2rem;
        padding: 0 var(--ddb-spacing-sm);
        border-radius: var(--ddb-radius-md);
        color: var(--ddb-text-secondary);
        text-decoration: none;
        font-size: var(--ddb-font-size-sm);
    }

    .primary-nav-link:hover {
        color: var(--ddb-text);
        background: var(--ddb-bg-hover);
    }

    .primary-nav-link[aria-current="page"] {
        color: var(--ddb-text);
        font-weight: 600;
        background: var(--ddb-bg-hover);
    }

    .primary-nav-label {
        display: none;
    }

    @media screen and (min-width: 576px) {
        .primary-nav-label {
            display: inline;
        }
    }

    /* Between the logo and the buttons from md; on a row of its own below, so a long name has the width of the screen */
    .header-crumbs {
        flex: 1 1 0;
        min-width: 0;
        margin-left: var(--ddb-spacing-md);
    }

    @media screen and (max-width: 767.98px) {
        .header-crumbs {
            order: 3;
            flex: 1 0 100%;
            margin-left: 0;
        }
    }

    .user-name,
    .header-action-label {
        margin-left: var(--ddb-spacing-xs);
    }

    .user-role {
        margin-left: var(--ddb-spacing-xs);
        padding: 0 var(--ddb-spacing-xs);
        border-radius: var(--ddb-radius-md);
        background: var(--ddb-bg-hover);
        font-size: var(--ddb-font-size-sm);
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
