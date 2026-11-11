<template>
    <!-- Below `sm` with mobileCollapsed the first pane and the handle are hidden (FR-EXP-29), not removed: the second
         pane stays the same element whatever the width, so a phone that rotates keeps what it shows (its tabs, the map) -->
    <Splitter ref="splitter" :layout="layout" class="panel-splitter" :class="{ 'panel-collapsed': collapsed }" :pt="splitterPt"
              @resizeend="onResizeEnd">
        <SplitterPanel :size="size0" :min-size="2">
            <slot v-if="firstShown" name="first" />
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
import { useStackedLayout } from '@/composables/useStackedLayout';
import { PREF, getPref, setPref } from '@/libs/preferences';
import { resolveLengthPx, pxToPercent, percentToPx, capPaneWidth } from '@/libs/panelSize';

/** The smallest size of a pane, in percent (SplitterPanel min-size). */
const MIN_PANE = 2;
/** What the second pane keeps when the first one is wider than the container allows */
const OTHER_PANE_MIN = '20rem';

/**
 * Panel - Two-pane resizable split layout backed by PrimeVue Splitter.
 *
 * With a storageKey, the size the user drags the panes to is kept on this device
 * (PREF.PANEL_SIZES), once for desktop and once for tablet screens, and restored on
 * the next visit. Phones always start from mobileAmount.
 *
 * With firstSize, the first pane of a desktop screen has a width, not a share: the extra width of a large screen
 * goes to the content (FR-EXP-40). The width is resolved to px, converted to the percent the Splitter needs when
 * the panel mounts and every time its container changes size (ResizeObserver), and the width the user drags the pane
 * to is kept in px (`<storageKey>.desktop.px`), so it is the same width on another window size.
 *
 * Props:
 *   split        - Orientation: 'vertical' (default) or 'horizontal'.
 *   amount       - Initial size of the first pane as a percentage (default: '50%').
 *   firstSize    - The width of the first pane on a desktop screen: px, rem or any CSS length, such as
 *                  'var(--ddb-panel-tree-width)'; amount is what a first render and a failed measure use.
 *   mobileAmount, tabletAmount - The same on phones and tablets (default: amount).
 *   storageKey   - Name under which the size is kept; none: not kept.
 *   mobileCollapsed - Below `sm` (the phone breakpoint of libs/responsiveColumns.js, the width of the window, not
 *                  the screen of `isMobile`) show only the second pane: the first pane and the handle are hidden.
 *                  It follows the window (a phone that rotates): the second pane is never rendered again, only
 *                  what is around it changes. The first pane's content is rendered once the pane is shown (a
 *                  phone in portrait does not load it). The page gives that content another place below `sm`
 *                  (the dataset page: its Browser tab).
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
        firstSize: {
            type: String,
            default: ""
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
        },
        mobileCollapsed: {
            type: Boolean,
            default: false
        }
    },
    setup() {
        return { phoneWidth: useStackedLayout() };
    },
    data: function () {
        const size = this.initialSize();
        return {
            size0: size,
            size1: 100 - size,
            // The first pane's content, rendered from the first time the pane is shown
            firstShown: !(this.mobileCollapsed && this.phoneWidth),
            registeredChildren: []
        };
    },
    computed: {
        collapsed: function () {
            return this.mobileCollapsed && this.phoneWidth;
        },
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
    watch: {
        collapsed: function (collapsed) {
            if (!collapsed) this.firstShown = true;
            // The second pane changed size
            this.$nextTick(() => this.onPanelResized());
        }
    },
    created: function () {
        // Instance state, not reactive: the width the user dragged the first pane to in this session, in px
        this.draggedPx = null;
        this.resizeObserver = null;
    },
    mounted: function () {
        if (!this.pxMode()) return;
        this.fitFirstPane();
        if (typeof ResizeObserver !== 'undefined') {
            // lifetime: this component (disconnected in beforeUnmount)
            this.resizeObserver = new ResizeObserver(() => this.fitFirstPane());
            this.resizeObserver.observe(this.splitterEl());
        }
    },
    beforeUnmount: function () {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    },
    methods: {
        panelSize: function () {
            if (isMobile() && this.mobileAmount) return this.mobileAmount;
            else if (isTablet() && this.tabletAmount) return this.tabletAmount;
            else return this.amount;
        },

        /** The element of the Splitter (the root of this component can be a fragment: the comment above it stays in a development build) */
        splitterEl: function () {
            return this.$refs.splitter?.$el ?? null;
        },
        /** Whether the first pane has a width in px (firstSize, on a desktop screen) and not a share of the container */
        pxMode: function () {
            return !!this.firstSize && !isMobile() && !isTablet();
        },
        /** @returns {number} the size of the first pane for the first render, in percent */
        initialSize: function () {
            if (!this.pxMode()) return this.storedSize() ?? parseFloat(this.panelSize());
            // The container is not measured yet: the window stands for it, the mount corrects it (fitFirstPane)
            const px = this.storedPx() ?? resolveLengthPx(this.firstSize, null);
            const container = typeof window !== 'undefined' ? window.innerWidth : 0;
            return (px !== null && pxToPercent(capPaneWidth(px, container, resolveLengthPx(OTHER_PANE_MIN, null) ?? 320, MIN_PANE), container, MIN_PANE)) || parseFloat(this.amount);
        },
        /** The width in px the first pane has now: what the user dragged it to, else firstSize */
        wantedPx: function () {
            return this.draggedPx ?? this.storedPx() ?? resolveLengthPx(this.firstSize, this.splitterEl());
        },
        /** Put the first pane at its width in px in the container it has now (mount, and a change of its size) */
        fitFirstPane: function () {
            const container = this.splitterEl()?.clientWidth ?? 0;
            const wanted = this.wantedPx();
            // A width kept from a wider window (dragged, or stored) leaves the other pane its minimum, but stays kept as it is
            const px = wanted === null ? null : capPaneWidth(wanted, container, resolveLengthPx(OTHER_PANE_MIN, null) ?? 320, MIN_PANE);
            const percent = px === null ? null : pxToPercent(px, container, MIN_PANE);
            if (percent === null) return;
            const changed = Math.abs(percent - this.size0) > 0.001;
            this.size0 = percent;
            this.size1 = 100 - percent;
            this.setPaneBasis(percent);
            if (changed) this.onPanelResized();
        },
        /**
         * The Splitter takes the sizes of its panes when it mounts and from the handle: a size set afterwards goes to the
         * panes and to its own list of sizes (what the next drag and resizeend start from)
         * @param {number} percent
         */
        setPaneBasis: function (percent) {
            const splitter = this.$refs.splitter;
            const panels = [...(this.splitterEl()?.children ?? [])].filter(c => c.getAttribute('data-pc-name') === 'splitterpanel');
            if (panels.length !== 2) return;
            const gutter = Number.isFinite(splitter?.gutterSize) ? splitter.gutterSize : 4;
            [percent, 100 - percent].forEach((p, i) => { panels[i].style.flexBasis = `calc(${p}% - ${gutter}px)`; });
            if (splitter) splitter.panelSizes = [percent, 100 - percent];
        },
        /** @returns {number|null} the kept width of the first pane in px, if a valid one is kept */
        storedPx: function () {
            const key = this.sizeKey();
            if (!key) return null;
            const px = getPref(PREF.PANEL_SIZES, {})?.[`${key}.px`];
            return Number.isFinite(px) && px > 0 ? px : null;
        },
        storePx: function (px) {
            const key = this.sizeKey();
            if (!key || !Number.isFinite(px)) return;
            const sizes = getPref(PREF.PANEL_SIZES, {});
            setPref(PREF.PANEL_SIZES, { ...(sizes && typeof sizes === 'object' ? sizes : {}), [`${key}.px`]: Math.round(px) });
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
                if (this.pxMode()) {
                    // The width is what the user chose: it is kept, and held when the container changes
                    const px = Math.round(percentToPx(size, this.splitterEl().clientWidth));
                    if (px > 0) {
                        this.draggedPx = px;
                        this.storePx(px);
                    }
                } else {
                    this.storeSize(size);
                }
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

/* Collapsed (mobileCollapsed below sm): no first pane and no handle, the second pane takes the whole width (over the
   flex-basis the Splitter sets inline) */
.panel-splitter.panel-collapsed > :deep(.p-splitterpanel:first-child),
.panel-splitter.panel-collapsed > :deep(.panel-gutter) {
    display: none;
}

.panel-splitter.panel-collapsed > :deep(.p-splitterpanel:last-child) {
    flex-basis: 100% !important;
}
</style>
