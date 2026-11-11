<template>
    <!-- The live region is always there, so that what appears in it is announced; the failure is its own alert -->
    <div class="heavy-task" role="status" data-testid="heavy-task-live">
        <div v-if="view" class="heavy-task-status" :class="`heavy-task-${view.kind}`" :title="view.title || undefined"
             data-testid="heavy-task-status">
            <div class="heavy-task-line">
                <i :class="view.icon" aria-hidden="true" />
                <!-- Read whole when the state changes; the percent changes at every poll and is not read (the bar has it) -->
                <span class="heavy-task-state" aria-atomic="true">
                    <span v-if="label" class="heavy-task-label">{{ label }}</span>
                    <span class="heavy-task-text">{{ view.text }}</span>
                </span>
                <span v-if="view.percent" class="heavy-task-percent" aria-hidden="true">{{ view.percent }}</span>
                <Button v-if="canCancel" class="heavy-task-cancel" type="button" label="Cancel" size="small" severity="secondary" text
                        :aria-label="label ? `Cancel ${label}` : 'Cancel task'" :disabled="cancelling" data-testid="heavy-task-cancel"
                        @click="emit('cancel', task)" />
            </div>
            <ProgressBar v-if="view.kind === 'running'" class="heavy-task-bar" :value="view.value ?? 0" :show-value="false"
                         :aria-label="label ? `${label} progress` : 'Progress'" />
            <p v-if="view.error" class="heavy-task-error" role="alert" data-testid="heavy-task-error">{{ view.error }}</p>
        </div>
    </div>
</template>

<script setup>
/**
 * HeavyTaskStatus - the state of the task a tool dialog started (FR-XC-15): queued, running with the
 * phase and the percent, done, or failed with the message of the task (FR-XC-06), cancelled. One component for
 * every tool dialog (Merge, Align, Extract, the training export), fed by the live entry of useHeavyTask:
 *
 *   const { heavyTasks, runHeavyTask } = useHeavyTask();
 *   const taskId = ref(null);
 *   const task = computed(() => heavyTasks.value[taskId.value]);
 *   runHeavyTask(dataset, 'merge-multispectral', { params, onSubmitted: entry => { taskId.value = entry.taskId; } });
 *   <HeavyTaskStatus :task="task" :error="refusal" label="Merge" />
 *
 * `error` is the reason of a failure that has no task (a refusal of the submit), shown as a failed state.
 * The component keeps no copy of the task. It says nothing without a task and without an error.
 *
 * `cancellable` offers Cancel on a queued or running task (a dialog whose task waits for a processing node needs
 * an exit): the component only emits `cancel` with the task; the dialog asks and cancels through
 * useHeavyTaskCancel, the question every task cancel shares (FR-PRC-10). `cancelling` disables the button meanwhile.
 *
 * Accessibility: the wrapper is a stable status region; the state (label and words) is read whole when it
 * changes, the percent is hidden from it (it changes at each poll; the bar carries the value); the reason of
 * a failure is its own alert.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { describeHeavyTask } from '@/libs/tasks/heavyTaskStatus';

defineOptions({ name: 'HeavyTaskStatus' });

const props = defineProps({
    /** A live entry of useHeavyTask (state, percent, phase, error, waitingForNode) */
    task: { type: Object, default: null },
    /** The task's name in the dialog ("Align", "Build") */
    label: { type: String, default: '' },
    /** Why a submit was refused (no task exists) */
    error: { type: String, default: '' },
    /** The words of the phases a tool reports, when they are not words yet */
    phases: { type: Object, default: () => ({}) },
    /** Offer Cancel while the task is queued or running */
    cancellable: { type: Boolean, default: false },
    /** A cancel is being asked or sent: the button waits */
    cancelling: { type: Boolean, default: false }
});
const emit = defineEmits(['cancel']);

const view = computed(() => describeHeavyTask(props.task, { error: props.error || null, phases: props.phases }));
// Only a task that exists and has not ended: a failure, a result or a refusal has nothing to cancel
// The server's actions decide when the task carries them (FR-XC-15): no Cancel for a caller who may not cancel
const serverAllowsCancel = computed(() => !Array.isArray(props.task?.actions) || props.task.actions.includes('cancel'));
const canCancel = computed(() => props.cancellable && !!props.task && serverAllowsCancel.value
    && (view.value?.kind === 'queued' || view.value?.kind === 'running'));
</script>

<style scoped>
.heavy-task-status {
    margin: 0.3rem 0;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    font-size: 0.88rem;
    background: var(--p-surface-100);
}
.heavy-task-done { background: var(--p-green-50); }
.heavy-task-failed { background: var(--p-red-50); }
.heavy-task-running { background: var(--ddb-primary-50); }

.heavy-task-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.heavy-task-state {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.heavy-task-label { font-weight: 600; }
.heavy-task-text { flex: 1; color: var(--p-text-muted-color); }
.heavy-task-percent { font-variant-numeric: tabular-nums; }
.heavy-task-bar { height: 0.35rem; margin-top: 0.35rem; }
.heavy-task-error {
    margin: 0.35rem 0 0;
    color: var(--p-red-900);
    overflow-wrap: anywhere;
}
</style>
