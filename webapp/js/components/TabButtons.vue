<template>
    <div class="tab-buttons-strip">
        <Tabs :value="activeTab" @update:value="onTabChange">
            <TabList>
                <Tab v-for="t in tabs" :key="t.key" :value="t.key">
                    <i class="icon" :class="{ padded: !!t.hideLabel, [t.icon]: true }" :title="t.label" style="margin-right: 0.375rem;" /><span
                        v-if="!t.hideLabel" class="mobile hide"> {{ t.label }}</span>
                    <span @click.stop="closeTab(t)" v-if="!!t.canClose" class="close-btn"><i class="fa-solid fa-xmark"></i></span>
                </Tab>
            </TabList>
        </Tabs>
    </div>
</template>

<script>
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';

export default {
    components: {
        Tabs,
        TabList,
        Tab
    },
    emits: ['click', 'closeTab'],
    props: {
        tabs: {
            type: Array,
            required: true
        },
        defaultTab: {
            type: String,
            default: "",
        },
        position: {
            type: String,
            default: "bottom"
        },
        buttonWidth: {
            type: String,
            default: "expand"
        }
    },
    data: function () {
        return {
            activeTab: this.defaultTab ? this.defaultTab : this.tabs[0].key
        };
    },
    methods: {
        closeTab: function (tab) {
            this.$emit("closeTab", tab.key);
        },
        onTabChange: function (value) {
            const tab = this.tabs.find(t => t.key === value);
            if (tab) {
                this.activeTab = value;
                this.$emit("click", tab);
            }
        },
        setActiveTab: function (tab, event = true) {
            this.activeTab = tab.key;
            if (event) this.$emit("click", tab);
        }
    }
}
</script>

<style scoped>
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
        color: #444;
    }
    &:active {
        color: #ddd;
    }
}
.icon.padded {
    padding-left: 0.1875rem;
}
</style>