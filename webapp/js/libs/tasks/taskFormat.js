// @ts-check
/**
 * Presentation of Processing Platform tasks. Pure functions: the tool catalog and state machine come from the server's
 * /sys/features and are passed in.
 */
import { formatTimeAgo, formatDateTime, formatDuration } from '@/libs/format';

/** @typedef {{ id: string, title?: string, resultExtension?: string, producesArtifact?: boolean, hidden?: boolean, disabled?: boolean }} TaskTool */
/** @typedef {{ value: string, terminal: boolean }} TaskState */

/** PrimeVue Tag severity of a state. @param {string} state */
export function tagSeverity(state) {
    switch (state) {
        case 'Succeeded': return 'success';
        case 'Failed': return 'danger';
        case 'Processing': return 'warn';
        case 'Enqueued':
        case 'Scheduled':
        case 'Reused': return 'info';
        default: return 'secondary';
    }
}

/** Font Awesome icon of a state. @param {string} state */
export function stateIcon(state) {
    switch (state) {
        case 'Succeeded': return 'fa-solid fa-check';
        case 'Failed': return 'fa-solid fa-xmark';
        case 'Processing': return 'fa-solid fa-gear fa-spin';
        case 'Deleted': return 'fa-solid fa-ban';
        default: return 'fa-regular fa-clock';
    }
}

/**
 * Whether a state is still running; unknown states (e.g. the client-side "Reused") are.
 * @param {string} state
 * @param {TaskState[]} states
 */
export function isActiveTaskState(state, states) {
    const s = states.find(x => x.value === state);
    return s ? !s.terminal : true;
}

/** @param {string|null|undefined} value */
export const taskDateTime = value => formatDateTime(value, { seconds: true });

/** @param {string|null|undefined} value */
export const taskTimeAgo = value => (value ? formatTimeAgo(new Date(value).getTime()) : '');

/** Elapsed time of a task in flight. @param {{ startedAt?: string, createdAt?: string }} task @param {number} now */
export function runningTime(task, now) {
    const start = task.startedAt || task.createdAt;
    return start ? formatDuration(now - new Date(start).getTime()) : '';
}

/** Length of a concluded task. @param {{ startedAt?: string, createdAt?: string, finishedAt?: string }} task */
export function taskDuration(task) {
    const start = task.startedAt || task.createdAt;
    if (!task.finishedAt || !start) return '';
    const ms = new Date(task.finishedAt).getTime() - new Date(start).getTime();
    return ms < 0 ? '' : formatDuration(ms);
}

/** Synthetic download name; the extension comes from the tool catalog. @param {any} task @param {TaskTool[]} tools */
export function resultFileName(task, tools) {
    const tool = tools.find(t => t.id === task.toolId);
    const ext = tool && tool.resultExtension ? tool.resultExtension : 'bin';
    return `${task.toolId || 'task'}_${task.taskId}.${ext}`;
}

/** Server-computed expiry (retention sweep) of a task's artifact, or null. @param {any} task */
export function artifactExpiresAt(task) {
    if (!task) return null;
    return task.artifact ? task.artifact.expiresAt : (task.artifactExpiresAt || null);
}

/**
 * Whether a succeeded task still has a downloadable result: the tool produces one and
 * its retention window has not elapsed at `now`.
 * @param {any} task @param {TaskTool[]} tools @param {number} now
 */
export function canDownloadResult(task, tools, now) {
    if (!task || task.state !== 'Succeeded') return false;
    const tool = tools.find(t => t.id === task.toolId);
    if (!tool || !tool.producesArtifact) return false;
    const expiresAt = artifactExpiresAt(task);
    return !(expiresAt && new Date(expiresAt).getTime() <= now);
}

/** Tooltip of the result download button. @param {any} task */
export function resultAvailabilityHint(task) {
    const expiresAt = artifactExpiresAt(task);
    return expiresAt ? `Download result (available until ${taskDateTime(expiresAt)})` : 'Download result';
}

/** Tool title from the catalog, else the tool id. @param {string} toolId @param {TaskTool[]} tools */
export function toolTitle(toolId, tools) {
    const tool = tools.find(t => t.id === toolId);
    return tool && tool.title ? tool.title : (toolId || 'Task');
}
