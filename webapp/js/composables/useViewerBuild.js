// @ts-check
/**
 * useViewerBuild - what a viewer does with a file that cannot open yet because its build is missing, running, on hold or
 * failed (FR-VWR-08, FR-XC-16). The viewer asks the availability check, and hands the result of a file that cannot open to
 * `setAvailability`; the composable gives `notice`, which ViewerShell shows (the build state, 'Building… 40 %', and the
 * Build / Rebuild button for somebody who can write), and calls `reload` when the build ends (useBuildCompletion on the
 * BuildManager's event: no poll and no taskMonitor subscription of its own), so the viewer loads the file by itself.
 *
 *   const buildWait = useViewerBuild({ dataset, path: () => entry.value?.path, canWrite, reload });
 *   // in load(): if (!availability.available) { buildWait.setAvailability(availability); return; }
 *   // template: <ViewerShell :build="buildWait.notice.value" @build="buildWait.build">
 */
import { computed, ref, toValue, watch } from 'vue';
import BuildManager from '@/libs/build/buildManager';
import { isTerminalState } from '@/libs/tasks/taskStates';
import { formatNumber } from '@/libs/format';
import { useBuildCompletion } from '@/composables/useBuildCompletion';

/** The statuses of the availability check that are a build state the viewer waits on (the others are errors). */
export const BUILD_WAIT_STATUSES = Object.freeze(['building', 'queued', 'rebuild', 'blocked', 'failed', 'unknown']);

/** @param {{ status?: string } | null | undefined} availability */
export const isBuildWait = availability => !!availability && BUILD_WAIT_STATUSES.includes(/** @type {string} */ (availability.status));

/**
 * @typedef {object} ViewerBuildNotice
 * @property {'building' | 'queued' | 'rebuild' | 'blocked' | 'failed' | 'unknown'} status
 * @property {string} title
 * @property {string} text
 * @property {number | null} percent  how far a running build is (0-100), or null
 * @property {boolean} canBuild  the Build / Rebuild button is offered (the user can write, nothing is starting)
 * @property {string} actionLabel  'Build' for a file never built, 'Rebuild' otherwise
 * @property {string} error  why the build could not be started, or ''
 */

/**
 * @param {object} options
 * @param {any} options.dataset  the ddb Dataset, a ref or a getter of it (null until it loaded)
 * @param {() => string | null | undefined} options.path  the dataset path of the file
 * @param {boolean | import('vue').Ref<boolean> | (() => boolean)} [options.canWrite]
 * @param {() => Promise<void> | void} options.reload  loads the file again: lists it, checks it, opens it (called when the build ends)
 */
export function useViewerBuild({ dataset, path, canWrite = false, reload }) {
    const currentDataset = () => toValue(dataset) ?? null;
    const mayWrite = () => !!toValue(canWrite);

    /** The availability result of a file that cannot open yet, or null. */
    const availability = ref(null);
    const startError = ref('');
    let reloading = false;
    // A reason to load again came while a reload ran (its result may predate the end of the build)
    let again = false;
    // The ended build the file was loaded again for: its end event, the state the task list shows and a check that still
    // says it builds are one reason, not three
    let reloadedFor = null;

    async function reloadOnce() {
        if (!availability.value) return;
        if (reloading) {
            again = true;
            return;
        }
        reloading = true;
        try {
            do {
                again = false;
                await reload();
            } while (again && availability.value);
        } finally {
            reloading = false;
            again = false;
        }
    }

    /** The build ended: the file is loaded again once for it (nothing while the file opens, there is no notice). */
    function reloadForEnd() {
        if (!availability.value) return;
        const ended = completion.buildState.value;
        if (ended && ended === reloadedFor) return;
        reloadedFor = ended;
        reloadOnce();
    }

    const completion = useBuildCompletion(currentDataset, () => [path() ?? ''], reloadForEnd);
    // A build that ended before the page had its task list is seen as a state, not as an event
    watch(() => completion.buildState.value?.currentState, state => {
        if (state && isTerminalState(state)) reloadForEnd();
    });

    /** @param {{ status?: string } | null} result  an availability result of a file that cannot open yet, or null once it can */
    function setAvailability(result) {
        availability.value = result;
        if (!result) {
            startError.value = '';
            return;
        }
        // The build ended while the file was being checked (its end found no notice to reload): the result says it runs,
        // the build state says it ended, so the file is checked once more
        const state = completion.buildState.value;
        if (result.status === 'building' && state && isTerminalState(state.currentState)) reloadForEnd();
    }

    /** @type {import('vue').ComputedRef<ViewerBuildNotice | null>} */
    const notice = computed(() => {
        const result = availability.value;
        if (!result) return null;
        const writer = mayWrite();
        // A build that runs now (this page started it, or the task list says so) is the state, whatever the check found before
        const status = completion.building.value ? 'building' : /** @type {ViewerBuildNotice['status']} */ (result.status);
        const percent = status === 'building' ? completion.percent.value : null;
        const never = status === 'queued';
        const words = {
            building: ['Building…', 'The file is being built. It opens here when the build ends.'],
            queued: ['Not built yet', writer ? 'This file has no build to show yet. Build it to open it here.' : 'This file has no build to show yet. Somebody who can write to the dataset can build it.'],
            // Built before this viewer could show it (a model with only its Nexus output): only a rebuild makes what it needs
            rebuild: ['Rebuild needed', writer ? 'The build of this file has no output this viewer can show. Rebuild it to open it here.' : 'The build of this file has no output this viewer can show. Somebody who can write to the dataset can rebuild it.'],
            failed: ['The build failed', writer ? 'The build of this file failed. Rebuild it to try again.' : 'The build of this file failed. Somebody who can write to the dataset can rebuild it.'],
            blocked: [/** @type {any} */ (result).title || 'The build is on hold', String(/** @type {any} */ (result).message || '').replace(/^The file '[^']*' cannot be opened yet\.\s*/, '')],
            unknown: ['The build is in an unexpected state', 'Rebuild the file to try again.']
        };
        const [title, text] = words[status] ?? words.unknown;
        return {
            status,
            title: status === 'building' && percent != null ? `${title} ${formatNumber(percent, 0)} %` : title,
            text,
            percent,
            canBuild: writer && status !== 'building',
            actionLabel: never ? 'Build' : 'Rebuild',
            error: startError.value
        };
    });

    /**
     * Starts the build: a forced one unless the file was never built (libddb skips the build of a file whose build is
     * complete, so a file built without the output the viewer needs is rebuilt only when forced). The notice shows it as
     * running from now.
     */
    async function build() {
        const ds = currentDataset();
        const file = path();
        if (!ds || !file || !mayWrite()) return;
        startError.value = '';
        try {
            await BuildManager.startBuild(ds, file, availability.value?.status !== 'queued');
        } catch (e) {
            startError.value = /** @type {Error} */ (e)?.message || 'The build could not be started.';
        }
    }

    return { notice, availability, setAvailability, build, completion };
}
