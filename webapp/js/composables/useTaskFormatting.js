// @ts-check
/**
 * useTaskFormatting - task presentation for task lists. The tool catalog and state machine come from the server's
 * /sys/features (the single source of truth); `now` ticks every second (shared clock) so
 * running times and artifact expiries update live.
 */
import { computed } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { useNow } from '@/composables/useTimers';
import * as fmt from '@/libs/tasks/taskFormat';

export function useTaskFormatting() {
    const now = useNow();

    /** @type {import('vue').ComputedRef<import('@/libs/tasks/taskFormat').TaskTool[]>} */
    const taskTools = computed(() => reg.features.value('taskTools') || []);
    /** @type {import('vue').ComputedRef<import('@/libs/tasks/taskFormat').TaskState[]>} */
    const taskStates = computed(() => reg.features.value('taskStates') || []);
    const stateOptions = computed(() => [{ label: 'All States', value: '' }]
        .concat(taskStates.value.map(s => ({ label: s.value, value: s.value }))));

    // A live catalog passed by the caller wins over the server's
    const tools = (list = []) => (Array.isArray(list) && list.length ? list : taskTools.value);

    return {
        now, taskTools, taskStates, stateOptions,
        isActive: state => fmt.isActiveTaskState(state, taskStates.value),
        stateTag: fmt.stateTag,
        formatDateTime: fmt.taskDateTime,
        getRelativeTime: fmt.taskTimeAgo,
        runningTime: task => fmt.runningTime(task, now.value),
        taskDuration: fmt.taskDuration,
        resultFileName: task => fmt.resultFileName(task, taskTools.value),
        canDownloadResult: (task, list = []) => fmt.canDownloadResult(task, tools(list), now.value),
        artifactExpiresAt: fmt.artifactExpiresAt,
        resultAvailabilityHint: fmt.resultAvailabilityHint,
        toolTitle: (toolId, list = []) => fmt.toolTitle(toolId, tools(list))
    };
}

