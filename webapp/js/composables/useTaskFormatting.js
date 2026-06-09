/**
 * useTaskFormatting
 *
 * Options-API mixin with the shared presentation helpers for Processing Platform
 * tasks (spec §B.3). The authoritative task metadata — the available tools, their
 * titles, result file extensions and the task state machine — is published by the
 * server in the `/sys/features` payload (loaded once at app bootstrap) and read
 * here, so the server stays the single source of truth (no hardcoded catalogs).
 *
 * Server-provided shapes:
 *   taskTools:  [{ id, version, title, requiredAccess, producesArtifact, resultExtension }]
 *   taskStates: [{ value, terminal }]
 *
 * Pure formatting (severity/icon/date/duration) stays client-side.
 */
import reg from '@/libs/api/sharedRegistry';

export default {
    data() {
        return {
            now: Date.now()
        };
    },

    mounted() {
        // `now` ticks every second so live running-time columns refresh.
        this._taskClockTimer = setInterval(() => { this.now = Date.now(); }, 1000);
    },

    beforeUnmount() {
        if (this._taskClockTimer) {
            clearInterval(this._taskClockTimer);
            this._taskClockTimer = null;
        }
    },

    computed: {
        // Authoritative tool catalog from the server.
        taskTools() {
            return reg.getFeatureValue('taskTools') || [];
        },

        // Authoritative task state machine from the server.
        taskStates() {
            return reg.getFeatureValue('taskStates') || [];
        },

        // Terminal state values, derived from the server state machine.
        terminalStates() {
            return this.taskStates.filter(s => s.terminal).map(s => s.value);
        },

        // Options for the state filter Select (built from the server states).
        stateOptions() {
            return [{ label: 'All States', value: '' }]
                .concat(this.taskStates.map(s => ({ label: s.value, value: s.value })));
        }
    },

    methods: {
        isActive(state) {
            const s = this.taskStates.find(x => x.value === state);
            // Unknown states (e.g. the transient client-side "Reused") are active.
            return s ? !s.terminal : true;
        },

        getTagSeverity(state) {
            switch (state) {
                case 'Succeeded': return 'success';
                case 'Failed': return 'danger';
                case 'Processing': return 'warn';
                case 'Enqueued':
                case 'Scheduled':
                case 'Reused': return 'info';
                case 'Deleted': return 'secondary';
                default: return 'secondary';
            }
        },

        getStateIcon(state) {
            switch (state) {
                case 'Succeeded': return 'fa-solid fa-check';
                case 'Failed': return 'fa-solid fa-xmark';
                case 'Processing': return 'fa-solid fa-gear fa-spin';
                case 'Deleted': return 'fa-solid fa-ban';
                default: return 'fa-regular fa-clock';
            }
        },

        formatDateTime(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(date);
        },

        getRelativeTime(dateString) {
            if (!dateString) return '';
            const diffMs = Date.now() - new Date(dateString).getTime();
            const minutes = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMs / 3600000);
            const days = Math.floor(diffMs / 86400000);
            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes} minutes ago`;
            if (hours < 24) return `${hours} hours ago`;
            if (days < 30) return `${days} days ago`;
            return 'Over a month ago';
        },

        // Elapsed time for a task still in flight.
        runningTime(task) {
            const start = task.startedAt || task.createdAt;
            if (!start) return '';
            // `now` is reactive (ticks every second) so this updates live.
            return this.formatDurationMs(this.now - new Date(start).getTime());
        },

        // Total length of a concluded task.
        taskDuration(task) {
            if (!task.finishedAt) return '';
            const start = task.startedAt || task.createdAt;
            if (!start) return '';
            const ms = new Date(task.finishedAt).getTime() - new Date(start).getTime();
            if (ms < 0) return '';
            return this.formatDurationMs(ms);
        },

        formatDurationMs(ms) {
            if (ms == null || ms < 0) return '';
            const totalSeconds = Math.floor(ms / 1000);
            const seconds = totalSeconds % 60;
            const minutes = Math.floor(totalSeconds / 60) % 60;
            const hours = Math.floor(totalSeconds / 3600);
            if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
            if (minutes > 0) return `${minutes}m ${seconds}s`;
            return `${seconds}s`;
        },

        // Synthetic download name; the extension comes from the server tool catalog.
        resultFileName(task) {
            const tool = this.taskTools.find(t => t.id === task.toolId);
            const ext = (tool && tool.resultExtension) ? tool.resultExtension : 'bin';
            return `${task.toolId || 'task'}_${task.taskId}.${ext}`;
        },

        /**
         * Whether a succeeded task still exposes a downloadable result. Uses the
         * server `producesArtifact` flag and the server-computed `artifactExpiresAt`
         * (the work directory is swept after the retention TTL), so an expired
         * artifact's download control is hidden instead of offering a 404 link.
         * Reactive to the 1s `now` clock so the control disappears exactly on expiry.
         * @param {Object} task
         * @param {Array} [tools] Optional live tool catalog [{ id, producesArtifact }]
         */
        canDownloadResult(task, tools = []) {
            if (!task || task.state !== 'Succeeded') return false;

            const list = (Array.isArray(tools) && tools.length) ? tools : this.taskTools;
            const tool = list.find(t => t.id === task.toolId);
            if (!tool || !tool.producesArtifact) return false;

            // Hide once the server-side retention window has elapsed.
            const expiresAt = task.artifact ? task.artifact.expiresAt : task.artifactExpiresAt;
            if (expiresAt && new Date(expiresAt).getTime() <= this.now) return false;

            return true;
        },

        // Server-computed expiry (TTL sweep) of a task's artifact, or null.
        artifactExpiresAt(task) {
            if (!task) return null;
            return task.artifact ? task.artifact.expiresAt : (task.artifactExpiresAt || null);
        },

        // Tooltip for the result download button: communicates the retention deadline.
        resultAvailabilityHint(task) {
            const expiresAt = this.artifactExpiresAt(task);
            if (!expiresAt) return 'Download result';
            return `Download result (available until ${this.formatDateTime(expiresAt)})`;
        },

        /**
         * Human-readable tool title from the server catalog (optionally from a
         * passed-in live catalog), falling back to the raw tool id.
         * @param {string} toolId
         * @param {Array} [tools] Optional live tool catalog [{ id, title }]
         */
        toolTitle(toolId, tools = []) {
            const list = (Array.isArray(tools) && tools.length) ? tools : this.taskTools;
            const tool = list.find(t => t.id === toolId);
            return (tool && tool.title) ? tool.title : (toolId || 'Task');
        }
    }
};
