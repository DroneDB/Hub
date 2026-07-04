<template>
    <Dialog :visible="visible" @update:visible="$emit('update:visible', $event)" modal
        :header="`Log - ${title}`" :style="{ width: '48rem' }" @show="onShow">
        <pre ref="logContainer" class="task-log">{{ logText || 'No log output.' }}</pre>
        <template #footer>
            <ToggleButton v-if="isActive" v-model="autoRefresh" :style="{ width: '9rem' }"
                onLabel="Refresh: On" offLabel="Refresh: Off"
                :checked-icon="'fa-solid fa-arrows-rotate'" :unchecked-icon="'fa-solid fa-arrows-rotate'"
                :disabled="false" />
            <ToggleButton v-model="autoScroll" :style="{ width: '8rem' }"
                onLabel="Scroll: On" offLabel="Scroll: Off"
                :checked-icon="'fa-solid fa-arrow-down'" :unchecked-icon="'fa-solid fa-arrow-down'" />
            <Button label="Refresh" severity="secondary" icon="fa-solid fa-arrows-rotate"
                @click="$emit('refresh')" />
            <Button label="Close" @click="$emit('update:visible', false)" />
        </template>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import ToggleButton from 'primevue/togglebutton';

/**
 * Presentational task log viewer dialog with auto-refresh and auto-scroll.
 * Shared by the Task History tab and the admin Tasks dashboard (spec §B.3).
 * The parent owns the log fetching and passes the text in; this component
 * only renders, manages the refresh interval, and re-emits refresh/close.
 *
 * Auto-refresh: polls every 2s for active tasks only (no polling for terminal).
 * Auto-scroll: scrolls to bottom on new content when user is near the bottom.
 * Both default to enabled and reset on each dialog open.
 */
export default {
    name: 'TaskLogDialog',

    components: { Dialog, Button, ToggleButton },

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
            _refreshInterval: null,
            _wasNearBottom: true  // Track whether user was near bottom before last change
        };
    },

    watch: {
        visible(val) {
            if (!val) {
                this.clearRefreshInterval();
            }
        },
        autoRefresh(val) {
            if (val) {
                this.startRefreshInterval();
            } else {
                this.clearRefreshInterval();
            }
        },
        logText() {
            this.handleLogTextChange();
        }
    },

    methods: {
        onShow() {
            // Reset toggles to enabled on each open
            this.autoRefresh = true;
            this.autoScroll = true;
            this._wasNearBottom = true;

            // Start auto-refresh only for active tasks
            if (this.isActive) {
                this.startRefreshInterval();
            }

            // Scroll to bottom on initial open, then attach scroll listener
            this.$nextTick(() => {
                this.scrollToBottom();
                this.attachScrollListener();
            });
        },

        /** Attach scroll listener to track user position relative to bottom. */
        attachScrollListener() {
            const el = this.$refs.logContainer;
            if (!el) return;
            el.addEventListener('scroll', this.onScroll, { passive: true });
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

        handleLogTextChange() {
            if (!this.autoScroll) return;

            this.$nextTick(() => {
                if (this._wasNearBottom) {
                    this.scrollToBottom();
                }
            });
        }
    },

    beforeUnmount() {
        this.clearRefreshInterval();
    }
};
</script>

<style scoped>
.task-log {
    max-height: 24rem;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
}

:deep(.p-togglebutton) {
    font-size: 0.78rem;
}
</style>
