<template>
    <Splitter :layout="layout" @resizeend="onResizeEnd" class="panel-splitter"
        :pt="{ gutter: { class: 'panel-gutter' } }">
        <SplitterPanel :size="size0" :minSize="2">
            <slot name="first" />
        </SplitterPanel>
        <SplitterPanel :size="size1" :minSize="2">
            <slot name="second" />
        </SplitterPanel>
    </Splitter>
</template>

<script>
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { isMobile, isTablet } from '../libs/responsive';

export default {
    components: {
        Splitter,
        SplitterPanel
    },
    props: {
        split: {
            type: String,
            default: "vertical"
        },
        amount: {
            type: String,
            default: "50%"
        },
        mobileAmount: {
            type: String,
            default: ""
        },
        tabletAmount: {
            type: String,
            default: ""
        }
    },

    provide() {
        return {
            registerPanelChild: this.registerChild,
            unregisterPanelChild: this.unregisterChild
        };
    },
    data: function () {
        const size = parseFloat(this.panelSize());
        return {
            size0: size,
            size1: 100 - size,
            registeredChildren: []
        };
    },
    computed: {
        layout: function () {
            return this.split === "horizontal" ? "vertical" : "horizontal";
        }
    },
    methods: {
        panelSize: function () {
            if (isMobile() && this.mobileAmount) return this.mobileAmount;
            else if (isTablet() && this.tabletAmount) return this.tabletAmount;
            else return this.amount;
        },

        registerChild(component) {
            this.registeredChildren.push(component);
        },
        unregisterChild(component) {
            this.registeredChildren = this.registeredChildren.filter(c => c !== component);
        },
        onTabActivated: function () {
            for (let i = 0; i < this.registeredChildren.length; i++) {
                const $c = this.registeredChildren[i];
                if ($c.onTabActivated !== undefined) {
                    $c.onTabActivated();
                }
            }
        },
        onPanelResized: function () {
            for (let i = 0; i < this.registeredChildren.length; i++) {
                const $c = this.registeredChildren[i];
                if ($c.onPanelResized !== undefined) {
                    $c.onPanelResized();
                }
            }
        },
        onResizeEnd: function () {
            this.onPanelResized();
        }
    }
}
</script>

<style>
.panel-splitter {
    height: 100%;
    min-height: 0;
    border: none !important;
}

.panel-splitter > .p-splitterpanel {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.panel-gutter {
    background: var(--ddb-border-separator) !important;
}
</style>