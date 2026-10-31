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
import { PREF, getPref, setPref } from '@/libs/preferences';

/** The smallest size of a pane, in percent (SplitterPanel min-size). */
const MIN_PANE = 2;

/**
 * Panel - Two-pane resizable split layout backed by PrimeVue Splitter.
 *
 * With a storageKey, the size the user drags the panes to is kept on this device
 * (PREF.PANEL_SIZES), once for desktop and once for tablet screens, and restored on
 * the next visit. Phones always start from mobileAmount.
 *
 * Props:
 *   split        - Orientation: 'vertical' (default) or 'horizontal'.
 *   amount       - Initial size of the first pane as a percentage (default: '50%').
 *   mobileAmount, tabletAmount - The same on phones and tablets (default: amount).
 *   storageKey   - Name under which the size is kept; none: not kept.
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
        },
        storageKey: {
            type: String,
            default: ""
        }
    },
    data: function () {
        const size = this.storedSize() ?? parseFloat(this.panelSize());
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

        /** Where the size is kept for this screen class; null: not kept (no storageKey, or a phone). */
        sizeKey: function () {
            if (!this.storageKey || isMobile()) return null;
            return `${this.storageKey}.${isTablet() ? 'tablet' : 'desktop'}`;
        },
        /** @returns {number|null} the kept size of the first pane, if a valid one is kept */
        storedSize: function () {
            const key = this.sizeKey();
            if (!key) return null;
            const size = getPref(PREF.PANEL_SIZES, {})?.[key];
            return Number.isFinite(size) && size >= MIN_PANE && size <= 100 - MIN_PANE ? size : null;
        },
        storeSize: function (size) {
            const key = this.sizeKey();
            if (!key || !Number.isFinite(size)) return;
            const sizes = getPref(PREF.PANEL_SIZES, {});
            setPref(PREF.PANEL_SIZES, { ...(sizes && typeof sizes === 'object' ? sizes : {}), [key]: Math.round(size * 100) / 100 });
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
        // Mouse, touch and keyboard resizing all end here
        onResizeEnd: function (event) {
            const size = event?.sizes?.[0];
            if (Number.isFinite(size)) {
                this.size0 = size;
                this.size1 = 100 - size;
                this.storeSize(size);
            }
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
