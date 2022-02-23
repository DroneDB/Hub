<template>
<div class="tab-switcher">
    <TabButtons :tabs="dynTabs"
                :defaultTab="activeTab"
                :position="position"
                :buttonWidth="buttonWidth"
                @closeTab="removeTab"
                ref="topTabButtons"
                v-if="position === 'top' && (!hideSingle || dynTabs.length > 1)" @click="setActiveTab" />
    <div class="tabs">
        <div class="tab" v-for="t in dynTabs" :class="{hidden: t.key !== activeTab}">
            <slot :name="t.key" />
        </div>
    </div>
    <TabButtons :tabs="dynTabs"
                :defaultTab="activeTab"
                :position="position"
                :buttonWidth="buttonWidth"
                @closeTab="removeTab"
                ref="bottomTabButtons"
                v-if="position === 'bottom' && (!hideSingle || dynTabs.length > 1)" @click="setActiveTab"/>
</div>
</template>

<script>
import { clone } from '../libs/utils';
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
  data: function(){
      return {
          activeTab: this.selectedTab != null ? this.selectedTab : this.tabs[0].key,
          dynTabs: clone(this.tabs)
      };
  },
  mounted: function(){
      // Trigger first onTabActivated
      const node = this.getNodeFor(this.activeTab);
      if (node.onTabActivated) node.onTabActivated();

      this.tabMap = {};
  },
  computed: {
      tabButtons: function(){
        if (this.$refs.bottomTabButtons) return this.$refs.bottomTabButtons;
        else return this.$refs.topTabButtons;
      }
  },
  methods: {
      getTagFor(tabKey){
          if (!this.$slots[tabKey]) return null;

          return this.$slots[tabKey][0].tag;
      },

      getNodeFor(tabKey){
          const tag = this.getTagFor(tabKey);
          return this.$children.find(c => c.$vnode.tag === tag);
      },

      activateTab(tabKey){
          const tab = this.getTabFor(tabKey);
          if (tab) this.setActiveTab(tab);
      },

      getTabFor(tabKey){
          return this.tabMap[tabKey];
      },

      setActiveTab: function(tab){
          if (this.activeTab !== tab.key){
            const curNode = this.getNodeFor(this.activeTab);
            if (curNode && curNode.onTabDeactivating !== undefined){
                curNode.onTabDeactivating();
            }
            
            this.activeTab = tab.key;
            this.tabButtons.setActiveTab(tab, false);

            // The Vue node is not available
            // until the next tick
            this.$nextTick(() => {
                const node = this.getNodeFor(tab.key);

                if (node && node.route !== undefined){
                    
                }

                if (node && node.onTabActivated !== undefined){
                    node.onTabActivated();
                }
            });
          }
      },

      onPanelResized: function(){
          // Propagate to tabs
          for (let i = 0; i < this.$children.length; i++){
            const $c = this.$children[i];
            if ($c.onPanelResized !== undefined){
                $c.onPanelResized();
            }
          }
      },

      hasTab: function(key){
          return !!this.$slots[key];
      },

      addTab: function(tab, opts = {}){
          this.$nextTick(() => {
            const activate = opts.activate !== undefined ? !!opts.activate : true;
            const tabIndex = opts.tabIndex !== undefined ? parseInt(opts.tabIndex) : NaN;
            
            if (this.$slots[tab.key]) this.removeTab(tab.key);

            const node = this.$createElement(tab.component, {
                props: tab.props
            });

            this.$slots[tab.key] = [node];
            
            const tabDef = {
                    label: tab.label,
                    icon: tab.icon,
                    key: tab.key,
                    hideLabel: tab.hideLabel,
                    canClose: !!tab.canClose
            };

            if (!isNaN(tabIndex)){
                this.dynTabs.splice(tabIndex, 0, tabDef);
            }else{
                this.dynTabs.push(tabDef);
            }

            if (activate){
                this.setActiveTab(tab);
                this.$forceUpdate();
            }

            this.tabMap[tab.key] = tab;
          });
      },

      removeTab: function(tabKey){
          const tabIndex = this.dynTabs.findIndex(t => t.key === tabKey);
          if (tabIndex !== -1){
            let tabToActivate = tabIndex - 1;

            // Last tab?
            if (tabToActivate < 0){
                tabToActivate = 0;
            }

            // No tabs left after?
            if (this.dynTabs.length === 1){
                tabToActivate = -1;
            }

            // Remove
            this.dynTabs = this.dynTabs.filter(t => t.key !== tabKey);

            if (tabToActivate !== -1){
                this.setActiveTab(this.dynTabs[tabToActivate]);
            }

            this.$slots[tabKey][0].componentInstance.$destroy();
            delete this.$slots[tabKey];
            delete this.tabMap[tabKey];
          }else{
              console.warn(`Cannot remove tab with key: ${tabKey}`);
          }
          
      }
  }
}
</script>

<style scoped>
.tab-switcher{
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow: hidden;

    .tabs {
        height: 100%;
        overflow: hidden;

        .tab {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: auto;
            background: #fefefe;
        }
    }

}
</style>