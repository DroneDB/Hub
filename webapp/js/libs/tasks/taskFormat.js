// @ts-check
/**
 * Presentation of Processing Platform tasks. Pure functions: the tool catalog and state machine come from the server's
 * /sys/features and are passed in.
 */
import { formatTimeAgo, formatDateTime, formatDuration } from '@/libs/format';
import { describePendingBuild } from '@/libs/build/pendingBuild';
import { isActiveState } from '@/libs/tasks/taskStates';

/** @typedef {{ id: string, title?: string, resultExtension?: string, producesArtifact?: boolean, hidden?: boolean, disabled?: boolean }} TaskTool */
/** @typedef {{ value: string, terminal: boolean }} TaskState */

/**
 * PrimeVue Tag severity of a task or build state. Work that runs or waits its turn is the brand
 * blue (the icon tells which), not a warning. @param {string} state
 */
export function tagSeverity(state) {
    switch (state) {
        case 'Succeeded': return 'success';
        case 'Failed': return 'danger';
        case 'Processing':
        case 'Enqueued':
        case 'Scheduled':
        case 'Awaiting':
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
 * Whether a task waits for files: a build that succeeded because libddb deferred it, its entry waiting now for the
 * files it names (an .obj without its .mtl). The server says so (waitingForFiles, with missingFiles) when it lists
 * the task; it builds by itself once one of those files is added.
 * @param {{ state?: string, waitingForFiles?: boolean } | null | undefined} task
 */
export const isWaitingForFiles = task => task?.state === 'Succeeded' && task.waitingForFiles === true;

/**
 * Whether a processing node holds the task in its queue: the server says so (waitingForNode, D-024) while the
 * node has not started it. The Hub reads the flag, never the phase message.
 * @param {{ state?: string, waitingForNode?: boolean } | null | undefined} task
 */
export const isWaitingForNode = task => task?.waitingForNode === true && isActiveState(task.state ?? '');

/**
 * Whether a user cancelled the task: the stored state of a cancelled task stays Deleted, and the server names
 * who cancelled it (cancelledBy, D-038). Other Deleted tasks (ended by the server) were not cancelled.
 * @param {{ state?: string, cancelledBy?: string | null } | null | undefined} task
 */
export const isCancelled = task => task?.state === 'Deleted' && !!task.cancelledBy;

/**
 * The state of a task in words, for every list, tag and tooltip (FR-PRC-20, FR-PRC-37): "Cancelled" for a task
 * a user cancelled, "Queued on node" while a processing node keeps it queued, else the state.
 * @param {{ state: string, waitingForNode?: boolean, cancelledBy?: string | null }} task
 */
export function stateLabel(task) {
    if (isCancelled(task)) return 'Cancelled';
    if (isWaitingForNode(task)) return 'Queued on node';
    return task.state;
}

/** Label of a state filter value: Deleted selects the cancelled tasks too. @param {string} state */
export const stateFilterLabel = state => (state === 'Deleted' ? 'Cancelled or deleted' : state);

/**
 * @typedef {object} TaskStateTag
 * @property {string} severity  PrimeVue Tag severity
 * @property {string} icon  Font Awesome icon
 * @property {string} label  the state in words
 * @property {string} title  tooltip
 * @property {string[]} files  the files a task that waits for files waits for; empty otherwise
 */

/**
 * The state tag of a task: its state's, except for a task that waits for files, which is a warning (yellow) with the
 * words of a deferred build (libs/build/pendingBuild), the same the file list shows for its entry; a task queued on
 * a processing node, which waits (clock); and a task a user cancelled, which says who (stateLabel).
 * @param {{ state: string, waitingForFiles?: boolean, missingFiles?: string[] | null, waitingForNode?: boolean, cancelledBy?: string | null }} task
 * @returns {TaskStateTag}
 */
export function stateTag(task) {
    if (isWaitingForFiles(task)) {
        const pending = describePendingBuild(task.missingFiles, true);
        return { severity: 'warn', icon: 'fa-solid fa-hourglass-half', label: pending.label, title: pending.text, files: pending.files };
    }
    if (isWaitingForNode(task))
        return { severity: 'info', icon: 'fa-regular fa-clock', label: stateLabel(task), title: 'Queued on node: it starts when the processing node is free', files: [] };
    if (isCancelled(task))
        return { severity: 'secondary', icon: stateIcon(task.state), label: stateLabel(task), title: `Cancelled by ${task.cancelledBy}`, files: [] };
    return { severity: tagSeverity(task.state), icon: stateIcon(task.state), label: task.state, title: task.state, files: [] };
}

/**
 * The files a task works on, in words: the label the tool gives them (targetLabel, FR-XC-25), else the task's
 * path, else nothing (a task of the whole dataset).
 * @param {{ targetLabel?: string | null, path?: string | null }} task
 */
export const taskTarget = task => task?.targetLabel || task?.path || '';

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

/**
 * Elapsed time of a task in flight; "waiting" while a processing node keeps it queued, as its processing starts
 * when the node starts it (startedAt).
 * @param {{ startedAt?: string, createdAt?: string, state?: string, waitingForNode?: boolean }} task @param {number} now
 */
export function runningTime(task, now) {
    if (isWaitingForNode(task)) return 'waiting';
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
