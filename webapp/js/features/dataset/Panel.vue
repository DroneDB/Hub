<template>
    <Splitter :layout="layout" class="panel-splitter" :pt="splitterPt"
              @resizeend="onResizeEnd">
        <SplitterPanel :size="size0" :min-size="2">
            <slot name="first" />
        </SplitterPanel>
        <SplitterPanel :size="size1" :min-size="2">
            <slot name="second" />
        </SplitterPanel>
    </Splitter>
</template>

<script>
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { isMobile, isTablet } from '@/libs/responsive';

/**
 * Panel - Two-pane resizable split layout backed by PrimeVue Splitter.
 *
 * Persists pane sizes to localStorage and adapts split direction on mobile.
 *
 * Props:
 *   split  - Orientation: 'vertical' (default) or 'horizontal'.
 *   amount - Initial size of the first pane as a percentage (default: '50%').
 */
export default {
    name: 'HubPanel',
    components: {
        Splitter,
        SplitterPanel
    },

    provide() {
        return {
            registerPanelChild: this.registerChild,
            unregisterPanelChild: this.unregisterChild
        };
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
        },
        // The focusable handle is the separator (PrimeVue puts the role on its
        // unfocusable parent and the value on the handle)
        splitterPt: function () {
            return {
                gutter: { class: 'panel-gutter', role: 'presentation' },
                gutterHandle: {
                    role: 'separator',
                    'aria-label': 'Resize panels',
                    'aria-orientation': this.layout === 'horizontal' ? 'vertical' : 'horizontal',
                    'aria-valuemin': 0,
                    'aria-valuemax': 100
                }
            };
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

<style scoped>
.panel-splitter {
    height: 100%;
    min-height: 0;
    border: none !important;
}

.panel-splitter > :deep(.p-splitterpanel) {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.panel-splitter :deep(.panel-gutter) {
    background: var(--ddb-border-separator) !important;
}
</style>
