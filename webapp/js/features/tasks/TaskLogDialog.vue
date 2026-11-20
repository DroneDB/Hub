<template>
    <!-- The size of a log (FR-XC-20): a line of about 140 characters fits without a break; the log takes the height
         the window has, all of the screen when the window is maximized (FR-PRC-44) -->
    <Window id="task-log" :visible="visible" modal :title="`Log - ${title}`" fixed-position size-class="dialog-log" maximizable
            @update:visible="$emit('update:visible', $event)" @show="onShow">
        <pre ref="logContainer" class="task-log" :class="{ 'no-wrap': !wrapLines }" @scroll.passive="onScroll">{{ shownText || 'No log output.' }}</pre>
        <template #footer>
            <!-- Toggles on the left -->
            <div class="d-flex align-items-center gap-3 me-auto">
                <div v-if="isActive" class="d-flex align-items-center gap-2">
                    <ToggleSwitch v-model="autoRefresh" input-id="task-log-auto-refresh" />
                    <label for="task-log-auto-refresh" class="muted" style="font-size: 0.8rem;">Auto-refresh</label>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <ToggleSwitch v-model="autoScroll" input-id="task-log-auto-scroll" />
                    <label for="task-log-auto-scroll" class="muted" style="font-size: 0.8rem;">Auto-scroll</label>
                </div>
                <!-- Off: a line stays one line, and the log scrolls sideways -->
                <div class="d-flex align-items-center gap-2">
                    <ToggleSwitch v-model="wrapLines" input-id="task-log-wrap-lines" />
                    <label for="task-log-wrap-lines" class="muted" style="font-size: 0.8rem;">Wrap lines</label>
                </div>
            </div>
            <Button label="Refresh" severity="secondary" icon="fa-solid fa-arrows-rotate"
                    @click="$emit('refresh')" />
            <Button label="Close" data-autofocus @click="$emit('update:visible', false)" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { utcClockToLocal } from '@/libs/format';
import { droppedHeadLines, lineOffset } from './logTail';

// The "[HH:mm:ss]" the Registry writes at the start of a log line, in UTC (LogRingBuffer)
const UTC_LINE_TIME = /^\[(\d{2}:\d{2}:\d{2})\]/gm;

/**
 * Presentational task log viewer dialog with auto-refresh and auto-scroll.
 * Shared by the Task History tab and the admin Tasks dashboard.
 * The parent owns the log fetching and passes the text in; this component
 * only renders, manages the refresh interval, and re-emits refresh/close.
 *
 * Auto-refresh: polls every 2s for active tasks only (no polling for terminal).
 * Auto-scroll: scrolls to bottom on new content when user is near the bottom; turned on, it goes to the bottom.
 * Not following the end (Auto-scroll off, or the user scrolled up), the lines in view stay in view: the log is the
 * last lines of the task only (logTail.js), so a refresh drops lines at its head, and the view moves up by their
 * height instead of showing the lines that came up into its place.
 * Both default to enabled and reset on each dialog open.
 * Wrap lines: on (the default) a long line wraps; off it stays one line and the log scrolls sideways.
 * The time at the start of each line, which the Registry writes in UTC, shows in local time, as
 * the dates of the task table do (libs/format.js).
 */
export default {
    name: 'TaskLogDialog',

    components: { Window, Button, ToggleSwitch },

    props: {
        visible: { type: Boolean, default: false },
        title: { type: String, default: '' },
        logText: { type: String, default: '' },
        /** Whether the task is still running (active state). Controls auto-refresh. */
        isActive: { type: Boolean, default: false }
    },

    emits: ['update:visible', 'refresh'],

    data() {
        return {
            autoRefresh: true,
            autoScroll: true,
            wrapLines: true
        };
    },

    computed: {
        shownText() {
            return this.logText.replace(UTC_LINE_TIME, (_, clock) => `[${utcClockToLocal(clock)}]`);
        }
    },

    watch: {
        visible(val) {
            if (!val) {
                this.clearRefreshInterval();
            }
        },
        autoRefresh(val) {
            if (val && this.isActive) {
                this.startRefreshInterval();
            } else {
                this.clearRefreshInterval();
            }
        },
        isActive(val) {
            if (!val) this.clearRefreshInterval();
        },
        autoScroll(val) {
            if (!val) return;
            this._wasNearBottom = true;
            this.$nextTick(() => this.scrollToBottom());
        },
        // A "pre" watcher: it runs before the log shows the new text, so it can measure the lines the text dropped
        shownText(text, oldText) {
            this.handleLogTextChange(text, oldText);
        }
    },

    // Instance state, not reactive (Vue does not proxy data keys that start with "_")
    created() {
        this._refreshInterval = null;
        this._wasNearBottom = true; // whether the user was near the bottom before the last change
    },

    beforeUnmount() {
        this.clearRefreshInterval();
    },

    methods: {
        onShow() {
            // Reset toggles to enabled on each open
            this.autoRefresh = true;
            this.autoScroll = true;
            this.wrapLines = true;
            this._wasNearBottom = true;

            // Start auto-refresh only for active tasks
            if (this.isActive) {
                this.startRefreshInterval();
            }

            // Scroll to bottom on initial open
            this.$nextTick(() => this.scrollToBottom());
        },

        /** Update _wasNearBottom on user scroll. */
        onScroll() {
            this._wasNearBottom = this.isNearBottom();
        },

        startRefreshInterval() {
            this.clearRefreshInterval();
            this._refreshInterval = setInterval(() => {
                this.$emit('refresh');
            }, 2000);
        },

        clearRefreshInterval() {
            if (this._refreshInterval) {
                clearInterval(this._refreshInterval);
                this._refreshInterval = null;
            }
        },

        /**
         * Check if the user is near the bottom of the log container (within 60px).
         */
        isNearBottom() {
            const el = this.$refs.logContainer;
            if (!el) return true;
            const threshold = 60;
            return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        },

        scrollToBottom() {
            const el = this.$refs.logContainer;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
        },

        handleLogTextChange(text, oldText) {
            if (this.autoScroll && this._wasNearBottom) {
                this.$nextTick(() => this.scrollToBottom());
                return;
            }

            // Not following the end: the lines in view keep their place on the screen
            const shift = this.droppedHeight(oldText, text);
            if (!shift) return;
            const el = this.$refs.logContainer;
            const top = el.scrollTop;
            this.$nextTick(() => {
                el.scrollTop = Math.max(0, top - shift);
            });
        },

        /**
         * The height of the lines at the head of the shown log that the new text no longer has, measured in the log
         * that still shows the old text (wrapped lines included). 0 when none was dropped or it cannot be measured.
         */
        droppedHeight(oldText, text) {
            if (!oldText || !text) return 0;
            const oldLines = oldText.split('\n');
            const dropped = droppedHeadLines(oldLines, text.split('\n'));
            if (!dropped) return 0;
            const first = this.charTop(0);
            const kept = this.charTop(lineOffset(oldLines, dropped));
            return first === null || kept === null ? 0 : kept - first;
        },

        /** The top, on the screen, of the character at `offset` of the shown log; null when it cannot be measured. */
        charTop(offset) {
            const node = this.$refs.logContainer?.firstChild;
            if (!node || node.nodeType !== Node.TEXT_NODE || offset >= node.length) return null;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getClientRects?.()[0];
            return rect ? rect.top : null;
        }
    }
};
</script>

<style scoped>
.task-log {
    /* As high as the window permits: the log grows and shrinks in the column of the window's content (a maximizable
       window, css/app.scss), so a long log scrolls here and the window around it does not, and a maximized window
       gives it the screen. Below a few lines it does not shrink: the window scrolls then (a very low screen) */
    flex: 1 1 auto;
    min-height: 5rem;
    overflow: auto;
    background: var(--ddb-console-bg);
    color: var(--ddb-console-text);
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
}

/* Wrap lines off: a line is one line, the log scrolls sideways */
.task-log.no-wrap {
    white-space: pre;
    word-break: normal;
}
</style>
