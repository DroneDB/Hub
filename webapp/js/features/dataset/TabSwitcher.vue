<template>
    <div class="tab-switcher" :class="{ 'position-top': position === 'top', 'bottom-nav-phone': bottomNavPhone }">
        <div v-if="showStrip" class="tab-buttons-strip">
            <Tabs :value="activeTab" @update:value="onTabChange">
                <TabList>
                    <Tab v-for="t in dynTabs" :key="t.key" :value="t.key"
                         :pt="{ root: { id: tabId(t.key), 'aria-controls': panelId(t.key) } }"
                         :aria-keyshortcuts="t.canClose ? 'Delete' : undefined"
                         :aria-label="t.hideLabel ? t.label : undefined"
                         @keydown.delete="t.canClose && removeTab(t.key)">
                        <!-- The icon's title is a tooltip; the name is the label (or the aria-label without one) -->
                        <i class="icon" :class="{ padded: !!t.hideLabel, [t.icon]: true }" :title="t.label" aria-hidden="true" /><span v-if="!t.hideLabel" class="tab-label">{{
                            t.label }}</span>
                        <span v-if="!!t.canClose" class="close-btn" aria-hidden="true" title="Close (Delete)" @click.stop="removeTab(t.key)"><i
                            class="fa-solid fa-xmark" /></span>
                    </Tab>
                </TabList>
            </Tabs>
        </div>
        <div class="tabs">
            <!-- Our own panels (Tabs renders only the strip): ids the tabs point to -->
            <div v-for="t in dynTabs" :id="panelId(t.key)" :key="t.key" :ref="el => { if (el) tabRefs[t.key] = el; }" class="tab"
                 :class="{ hidden: t.key !== activeTab }"
                 :role="showStrip ? 'tabpanel' : undefined" :aria-labelledby="showStrip ? tabId(t.key) : undefined">
                <slot :name="t.key" />
                <component :is="dynamicComponents[t.key].component" v-if="dynamicComponents[t.key]"
                           v-bind="dynamicComponents[t.key].props"
                           :ref="el => { if (el) dynamicChildRefs[t.key] = el; }" />
            </div>
        </div>
    </div>
</template>

<script>
import { clone } from '@/libs/utils';
import { markRaw, useId } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';

/**
 * TabSwitcher - Multi-tab panel supporting dynamic tab management.
 *
 * Tabs can be added/removed at runtime via openTab/closeTab. Supports
 * icons, labels, closable tabs, and an optional hide-single-tab mode.
 *
 * Props:
 *   tabs       - Initial tab definitions (Array of { key, label, icon }).
 *   defaultTab - Key of the tab to activate on mount.
 *   position   - Tab strip position: 'top' (default) or 'bottom'.
 *   hideSingle - Hide the tab strip when only one tab is present (default: false).
 *   bottomNavPhone - Below `sm` (576px, the phone breakpoint of libs/responsiveColumns.js) the strip is a bottom
 *                navigation: equal cells, each with its icon and its short label (FR-EXP-29). From `sm` up it
 *                is the strip of `position`.
 */
export default {
    components: {
        Tabs,
        TabList,
        Tab
    },
    provide() {
        return {
            registerTabChild: this.registerTabChild,
            unregisterTabChild: this.unregisterTabChild
        };
    },
    props: {
        tabs: {
            type: Array,
            required: true
        },
        hideSingle: {
            type: Boolean,
            default: false
        },
        bottomNavPhone: {
            type: Boolean,
            default: false
        },
        position: {
            type: String,
            default: "bottom" // one of "bottom", "top"
        },
        selectedTab: {
            type: String,
            default: null
        }
    },
    emits: ['tabChange'],
    setup: function () {
        return { uid: useId() };
    },
    data: function () {
        return {
            activeTab: this.selectedTab != null ? this.selectedTab : this.tabs[0].key,
            dynTabs: clone(this.tabs),
            registeredChildren: {},
            dynamicComponents: {},
            dynamicChildRefs: {},
            tabRefs: {}
        };
    },
    computed: {
        showStrip: function () {
            return !this.hideSingle || this.dynTabs.length > 1;
        }
    },
    watch: {
        // The page's tabs change (the dataset page below and from `sm`): the ones that left go, a new one comes in
        // after the page's tab before it; the tabs kept (their panels not rendered again) and those of addTab stay.
        // When the tab on show left, the page's first tab is shown.
        tabs: function (next, prev) {
            const leaving = new Set(prev.map(t => t.key));
            next.forEach(t => leaving.delete(t.key));
            const tabs = this.dynTabs.filter(t => !leaving.has(t.key));
            next.forEach((t, i) => {
                if (tabs.some(d => d.key === t.key)) return;
                const before = next.slice(0, i).reverse().find(p => tabs.some(d => d.key === p.key));
                tabs.splice(before ? tabs.findIndex(d => d.key === before.key) + 1 : 0, 0, clone(t));
            });
            this.dynTabs = tabs;
            if (!tabs.some(t => t.key === this.activeTab) && tabs.length) this.setActiveTab(tabs.find(t => t.key === next[0]?.key) || tabs[0]);
        }
    },
    mounted: function () {
        // Trigger first onTabActivated on next tick so children have registered
        this.$nextTick(() => {
            const node = this.getNodeFor(this.activeTab);
            if (node && node.onTabActivated) node.onTabActivated();
        });
        // Broadcast the initial tab so parents start in a consistent state
        this.$emit('tabChange', this.activeTab);
    },
    methods: {
        tabId(key) {
            return `${this.uid}-tab-${key}`;
        },
        panelId(key) {
            return `${this.uid}-panel-${key}`;
        },
        registerTabChild(key, component) {
            this.registeredChildren[key] = component;
        },
        unregisterTabChild(key) {
            delete this.registeredChildren[key];
        },
        getNodeFor(tabKey) {
            // First check registered children (slot-based components)
            if (this.registeredChildren[tabKey]) return this.registeredChildren[tabKey];
            // Then check dynamic component refs
            if (this.dynamicChildRefs[tabKey]) return this.dynamicChildRefs[tabKey];
            return null;
        },

        activateTab(tabKey) {
            const tab = this.getTabFor(tabKey);
            if (tab) {
                this.setActiveTab(tab);
            }
        },

        // Any tab on show: from the props or added with addTab (tabMap only had the
        // added ones, so activateTab('map') did nothing)
        getTabFor(tabKey) {
            return this.dynTabs.find(t => t.key === tabKey);
        },

        getActiveTabIndex: function () {
            let i = 0;
            for (; i < this.dynTabs.length; i++) {
                if (this.dynTabs[i].key === this.activeTab) break;
            }
            return i < this.dynTabs.length ? i : 0;
        },

        setActiveTab: function (tab) {
            if (this.activeTab !== tab.key) {
                const curNode = this.getNodeFor(this.activeTab);
                if (curNode && curNode.onTabDeactivating !== undefined) {
                    curNode.onTabDeactivating();
                }

                this.lastTabIndex = this.getActiveTabIndex();
                this.activeTab = tab.key;

                // Notify parent of the active tab change (e.g. to gate toolbar actions)
                this.$emit('tabChange', tab.key);

                // The Vue node is not available
                // until the next tick
                this.$nextTick(() => {
                    const node = this.getNodeFor(tab.key);

                    if (node && node.onTabActivated !== undefined) {
                        node.onTabActivated();
                    }
                });
            }
        },

        onTabChange: function (value) {
            const tab = this.dynTabs.find(t => t.key === value);
            if (tab) {
                this.setActiveTab(tab);
            }
        },

        onPanelResized: function () {
            // Propagate to tabs via registered children
            for (const key in this.registeredChildren) {
                const $c = this.registeredChildren[key];
                if ($c && $c.onPanelResized !== undefined) {
                    $c.onPanelResized();
                }
            }
            // Also propagate to dynamic component refs
            for (const key in this.dynamicChildRefs) {
                const $c = this.dynamicChildRefs[key];
                if ($c && $c.onPanelResized !== undefined) {
                    $c.onPanelResized();
                }
            }
        },

        hasTab: function (key) {
            return !!(this.$slots[key] || this.dynamicComponents[key]);
        },

        addTab: function (tab, opts = {}) {
            this.$nextTick(() => {
                const activate = opts.activate !== undefined ? !!opts.activate : true;
                const tabIndex = opts.tabIndex !== undefined ? parseInt(opts.tabIndex) : NaN;

                if (this.hasTab(tab.key)) this.removeTab(tab.key);

                // Store the component definition in reactive data
                this.dynamicComponents[tab.key] = {
                    component: markRaw(tab.component),
                    props: tab.props || {}
                };

                const tabDef = {
                    label: tab.label,
                    icon: tab.icon,
                    key: tab.key,
                    hideLabel: tab.hideLabel,
                    canClose: !!tab.canClose
                };

                if (!isNaN(tabIndex)) {
                    this.dynTabs.splice(tabIndex, 0, tabDef);
                } else {
                    this.dynTabs.push(tabDef);
                }

                if (activate) {
                    this.setActiveTab(tab);
                }
            });
        },

        removeTab: function (tabKey) {
            const tabIndex = this.dynTabs.findIndex(t => t.key === tabKey);
            if (tabIndex !== -1) {
                let tabToActivate = this.lastTabIndex !== undefined ? this.lastTabIndex : (tabIndex - 1);

                // Last tab?
                if (tabToActivate < 0) {
                    tabToActivate = 0;
                }

                // No tabs left after?
                if (this.dynTabs.length === 1) {
                    tabToActivate = -1;
                }

                // Remove
                this.dynTabs = this.dynTabs.filter(t => t.key !== tabKey);

                if (tabToActivate !== -1) {
                    this.setActiveTab(this.dynTabs[tabToActivate]);
                }

                // Clean up dynamic component data
                delete this.dynamicComponents[tabKey];
                delete this.dynamicChildRefs[tabKey];
                delete this.tabRefs[tabKey];
            } else {
                console.warn(`Cannot remove tab with key: ${tabKey}`);
            }

        }
    }
}
</script>

<style scoped>
.tab-switcher {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-height: 0;
    overflow: hidden;

    /* Default: tabs at bottom → buttons after content */
    &.position-top {
        .tab-buttons-strip {
            order: -1;
        }
    }

    .tab-buttons-strip {
        user-select: none;
        -webkit-user-select: none;
    }

    :deep(.p-tab) {
        font-family: inherit;
    }

    .close-btn {
        margin-left: 0.25rem;
        cursor: pointer;

        &:hover {
            color: var(--ddb-text-secondary);
        }

        &:active {
            color: var(--ddb-border);
        }
    }

    .icon.padded {
        padding-left: 0.25rem;
        margin-right: 0.5rem;
    }

    /* A phone shows only the label of the active tab (the global .tab-label rule) */
    .tab-label {
        margin-inline-start: 0.5rem;
    }

    .tabs {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;

        .tab {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: auto;
            background: var(--ddb-bg);

            &.hidden {
                display: none !important;
            }
        }
    }

}

/* Below sm: the strip is the bottom navigation, five equal cells that all show their icon and label (the global rule
   that leaves a phone only the label of the active tab does not apply here, FR-EXP-29) */
@media only screen and (max-width: 575.98px) {
    .tab-switcher.bottom-nav-phone .tab-buttons-strip {
        order: 1;
        border-top: var(--ddb-border-width) solid var(--ddb-border-medium);
    }

    .tab-switcher.bottom-nav-phone :deep(.p-tabs),
    .tab-switcher.bottom-nav-phone :deep(.p-tablist),
    .tab-switcher.bottom-nav-phone :deep(.p-tablist-content),
    .tab-switcher.bottom-nav-phone :deep(.p-tablist-viewport) {
        width: 100%;
        overflow: hidden;
    }

    .tab-switcher.bottom-nav-phone :deep(.p-tablist-tab-list) {
        width: 100%;
    }

    .tab-switcher.bottom-nav-phone :deep(.p-tablist-nav-button) {
        display: none;
    }

    .tab-switcher.bottom-nav-phone :deep(.p-tablist-active-bar) {
        top: 0;
        bottom: auto;
    }

    .tab-switcher.bottom-nav-phone :deep(.p-tab) {
        flex: 1 1 0;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        gap: 0.125rem;
        padding: 0.5rem 0.125rem;
        font-size: 0.75rem;
    }

    .tab-switcher.bottom-nav-phone .tab-label {
        position: static;
        width: auto;
        height: auto;
        margin: 0;
        padding: 0;
        overflow: hidden;
        clip: auto;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .tab-switcher.bottom-nav-phone .icon.padded {
        margin-right: 0;
        padding-left: 0;
    }
}
</style>