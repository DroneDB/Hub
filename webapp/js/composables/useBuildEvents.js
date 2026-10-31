// @ts-check
/**
 * useBuildEvents - build notifications of the dataset page. Listens to the BuildManager while the owning component lives and
 * reports build progress as toasts; errors go to the page's error dialog.
 *
 *   setup() { return { ...useBuildEvents() }; }
 *   mounted() { this.watchBuildEvents(() => this.dataset, (msg, title) => this.showError(msg, title)); }
 */
import { getCurrentScope, onScopeDispose } from 'vue';
import { pathutils } from 'ddb';
import BuildManager from '@/libs/build/buildManager';
import { notify } from '@/libs/notify';

/** @param {{ filePath?: string }} data */
const fileNameOf = data => (data.filePath ? pathutils.basename(data.filePath) : 'file');

export function useBuildEvents() {
    /** @type {() => any} */
    let getDataset = () => null;
    /** @type {(message: string, title: string) => void} */
    let showError = (message, title) => notify.error(message, { summary: title });

    // How a build ended. Its start already has a toast ("Build started", or the buildable files
    // detected after an upload), and the spinner shows that it runs
    const onStateChanged = data => {
        const name = fileNameOf(data);
        if (data.newState === 'Succeeded') notify.success(`Build completed for ${name}`, { summary: 'Build Completed' });
        else if (data.newState === 'Failed') notify.error(`Build failed for ${name}`, { summary: 'Build Failed' });
    };
    const onStarted = data => notify.info(`Build started for ${fileNameOf(data)}`, { summary: 'Build Started' });
    const onError = data => showError(data.error, 'Build Error');
    const onNewBuildable = data => {
        if (data.dataset !== getDataset()) return;
        const n = data.filePaths.length;
        notify.info(`${n} buildable file${n > 1 ? 's' : ''} detected - processing in background`, { summary: 'Buildable Files Detected' });
    };

    let listening = false;
    function stop() {
        if (!listening) return;
        BuildManager.off('buildStateChanged', onStateChanged);
        BuildManager.off('buildStarted', onStarted);
        BuildManager.off('buildError', onError);
        BuildManager.off('newBuildableFilesDetected', onNewBuildable);
        listening = false;
    }
    if (getCurrentScope()) onScopeDispose(stop);

    /**
     * Starts listening (from mounted(), when the page's dataset exists).
     * @param {() => any} datasetGetter
     * @param {(message: string, title: string) => void} [errorHandler]
     */
    function watchBuildEvents(datasetGetter, errorHandler) {
        getDataset = datasetGetter;
        if (errorHandler) showError = errorHandler;
        if (listening) return;
        BuildManager.on('buildStateChanged', onStateChanged);
        BuildManager.on('buildStarted', onStarted);
        BuildManager.on('buildError', onError);
        BuildManager.on('newBuildableFilesDetected', onNewBuildable);
        listening = true;
    }

    return {
        watchBuildEvents,
        // Build actions started from the explorer, table and detail panel
        handleBuildStarted: file => notify.info(`Build started for ${file.label}`, { summary: 'Build Started' }),
        handleBuildError: data => showError(data.error, 'Build Error')
    };
}

