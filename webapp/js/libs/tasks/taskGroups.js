// @ts-check
/**
 * The builds a task starts (the files a photogrammetry run adds, an archive it extracts) are tasks of their own, and
 * the Tasks tab lists them next to it: one run makes dozens of rows. They are shown under their task, with a count
 * (FR-PRC-26).
 */

/**
 * @typedef {object} ChildBuilds
 * @property {number} total  the builds hidden under the task
 * @property {number} active  of them, the ones still queued or running
 */

/**
 * The tasks of a list with the builds of a listed task folded into it: a build whose parentJobId is the id of
 * another task of the list leaves the list, and that task has `childBuilds` (the count). A failed build stays in
 * the list (its failure is not folded away), and so does a build whose parent is not in it (another page, a filter).
 * The other tasks are the same objects.
 * @template {{ taskId: string, toolId?: string, state?: string, parentJobId?: string | null }} T
 * @param {T[]} tasks
 * @param {(state: string) => boolean} isActive  whether a state is still in progress
 * @returns {(T & { childBuilds?: ChildBuilds })[]}
 */
export function foldBuildChildren(tasks, isActive) {
    const ids = new Set(tasks.map(t => t.taskId));
    /** @type {Map<string, ChildBuilds>} */
    const counts = new Map();
    /** @type {Set<string>} */
    const hidden = new Set();
    for (const task of tasks) {
        if (task.toolId !== 'build' || task.state === 'Failed' || !task.parentJobId || !ids.has(task.parentJobId)) continue;
        const count = counts.get(task.parentJobId) ?? { total: 0, active: 0 };
        count.total++;
        if (isActive(task.state ?? '')) count.active++;
        counts.set(task.parentJobId, count);
        hidden.add(task.taskId);
    }
    return tasks.filter(t => !hidden.has(t.taskId)).map(t => (counts.has(t.taskId) ? { ...t, childBuilds: counts.get(t.taskId) } : t));
}

/**
 * The words of the builds under a task: "9 builds", "9 builds, 2 running".
 * @param {ChildBuilds | null | undefined} childBuilds
 */
export function childBuildsText(childBuilds) {
    if (!childBuilds || childBuilds.total === 0) return '';
    const n = childBuilds.total;
    return `${n} build${n === 1 ? '' : 's'}${childBuilds.active ? `, ${childBuilds.active} running or queued` : ''}`;
}
