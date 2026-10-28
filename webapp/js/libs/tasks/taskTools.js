// @ts-check
/**
 * Which heavy tools the server offers: /sys/features lists them (`taskTools`), and a feature that
 * needs one is shown only when it is there, enabled and not hidden.
 */
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';

/**
 * @param {Array<{ id?: string, hidden?: boolean, disabled?: boolean }> | null | undefined} tools  the catalog
 * @param {string} toolId
 * @returns {boolean}
 */
export function isTaskToolOffered(tools, toolId) {
    if (!Array.isArray(tools)) return false;
    const tool = tools.find(t => t && t.id === toolId);
    return !!tool && !tool.hidden && !tool.disabled;
}

/** Whether this server offers a heavy tool. @param {string} toolId */
export function taskToolOffered(toolId) {
    return isTaskToolOffered(reg.features.value(Features.TASK_TOOLS), toolId);
}
