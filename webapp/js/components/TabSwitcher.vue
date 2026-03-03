<template>
    <div class="tab-switcher">
        <TabButtons :tabs="dynTabs" :defaultTab="activeTab" :position="position" :buttonWidth="buttonWidth"
            @closeTab="removeTab" ref="topTabButtons" v-if="position === 'top' && (!hideSingle || dynTabs.length > 1)"
            @click="setActiveTab" />
        <div class="tabs">
            <div class="tab" v-for="t in dynTabs" :key="t.key" :ref="el => { if (el) tabRefs[t.key] = el; }" :class="{ hidden: t.key !== activeTab }">
                <slot :name="t.key" />
                <component v-if="dynamicComponents[t.key]" :is="dynamicComponents[t.key].component" v-bind="dynamicComponents[t.key].props" :ref="el => { if (el) dynamicChildRefs[t.key] = el; }" />
            </div>
        </div>
        <TabButtons :tabs="dynTabs" :defaultTab="activeTab" :position="position" :buttonWidth="buttonWidth"
            @closeTab="removeTab" ref="bottomTabButtons"
            v-if="position === 'bottom' && (!hideSingle || dynTabs.length > 1)" @click="setActiveTab" />
    </div>
</template>

<script>
import { clone } from '../libs/utils';
import { h, markRaw } from 'vue';
import TabButtons from './TabButtons';

export default {
    components: {
        TabButtons
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
        position: {
            type: String,
            default: "bottom" // one of "bottom", "top"
        },
        buttonWidth: {
            type: String,
            default: "expand" // one of "expand", "auto"
        },
        selectedTab: {
            type: String,
            default: null
        }
    },
    provide() {
        return {
            registerTabChild: this.registerTabChild,
            unregisterTabChild: this.unregisterTabChild
        };
    },
    data: function () {
        return {
            activeTab: this.selectedTab != null ? this.selectedTab : this.tabs[0].key,
            dynTabs: clone(this.tabs),
            registeredChildren: {},
            dynamicComponents: {},
            dynamicChildRefs: {},
            tabRefs: {},
            tabMap: {}
        };
    },
    mounted: function () {
        // Trigger first onTabActivated on next tick so children have registered
        this.$nextTick(() => {
            const node = this.getNodeFor(this.activeTab);
            if (node && node.onTabActivated) node.onTabActivated();
        });
    },
    computed: {
        tabButtons: function () {
            if (this.$refs.bottomTabButtons) return this.$refs.bottomTabButtons;
            else return this.$refs.topTabButtons;
        }
    },
    methods: {
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

        getTabFor(tabKey) {
            return this.tabMap[tabKey];
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
                this.tabButtons.setActiveTab(tab, false);

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

                this.tabMap[tab.key] = tab;
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
                delete this.tabMap[tabKey];
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
            background: #fefefe;

            &.hidden {
                display: none !important;
            }
        }
    }

}
</style>