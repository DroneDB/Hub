/**
 * useMapFeatures - the features of the dataset map, wired together (the composition root of MapCore): measurements, plant health, raster analysis, stockpile
 * volume, contours, tooltip, basemap, the raster list, split compare and alerts.
 *
 * Features share the OpenLayers objects as refs (`map`, `measureControls`, `rasterLayer`,
 * `vectorLayers`, filled by the view when it builds the map) and never call each other:
 * the analysis panels open through useMapPanels, one at a time.
 *
 *   setup(props) { return { ...useMapFeatures(props), ... }; }
 */
import { shallowRef, computed } from 'vue';
import { toLonLat } from 'ol/proj';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { usePreference } from '@/composables/usePreference';
import { isRasterAnalysisCapable } from '@/libs/entryTypes';
import { escapeHtml } from '@/libs/sanitize';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { useMapAlerts } from '@/composables/useMapAlerts';
import { useMapBasemap } from '@/composables/useMapBasemap';
import { useMapTooltip } from '@/composables/useMapTooltip';
import { useMapMeasurements } from '@/composables/useMapMeasurements';
import { usePlantHealth } from '@/composables/usePlantHealth';
import { useRasterAnalysis } from '@/composables/useRasterAnalysis';
import { useStockpileVolume } from '@/composables/useStockpileVolume';
import { useContourLines } from '@/composables/useContourLines';
import { useMapPanels } from '@/composables/useMapPanels';
import { useMapSplitCompare } from '@/composables/useMapSplitCompare';
import { useRasterLayers } from '@/composables/useRasterLayers';
import { useAnalysisTarget, ANALYSIS_PANELS } from '@/composables/useAnalysisTarget';

/**
 * @param {{ files: any[], dataset: any, canWrite: boolean, canDelete: boolean, view?: any, savedLayers?: string[] }} props  `view`: the state of the view the map shows, null on the dataset map;
 *   `savedLayers`: the layers of the saved view, whose styles are the user's
 * @param {{ onFileWritten?: (path: string) => void, onFileRemoved?: (path: string) => void }} [fileEvents]
 *   told when the map writes or removes a file of the dataset (the measurements)
 */
export function useMapFeatures(props, fileEvents = {}) {
    const map = shallowRef(null);
    const measureControls = shallowRef(null);
    const rasterLayer = shallowRef(null);
    const vectorLayers = shallowRef([]);
    const currentUnitPref = usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
    const dialogs = useDialogs();
    const alerts = useMapAlerts();
    const dataset = () => props.dataset;
    const showAlert = () => alerts.showAlert;
    const showFlash = () => alerts.showFlash;
    const getMapCenterLatLon = () => {
        const center = map.value && map.value.getView().getCenter();
        return center ? toLonLat(center) : null;
    };

    const rasters = useRasterLayers({
        group: rasterLayer, vectorLayers, splitMode: () => split.splitMode.value,
        // A view has a row, with its own opacity and eye, for a lone raster too
        perRow: () => !!props.view
    });
    const split = useMapSplitCompare({ map, rasterLayers: rasters.rasterLayerList, onChange: rasters.updateRastersOpacity });

    const measurements = useMapMeasurements({
        canWrite: () => props.canWrite, canDelete: () => props.canDelete, measureControls, currentUnitPref,
        files: () => props.files, dataset, showAlert, showFlash,
        // The measurements follow the analysis target (see below)
        analysisTarget: () => analysisTarget.targetEntry.value,
        onFileWritten: () => fileEvents.onFileWritten || (() => {}),
        onFileRemoved: () => fileEvents.onFileRemoved || (() => {})
    });
    // The layers of a saved view keep the style it records, none included: the map seeds no default on them (FR-RAS-01)
    const plantHealth = usePlantHealth({ dataset, rasterLayer, entry: () => null, savedLayers: () => props.savedLayers || [] });
    const raster = useRasterAnalysis({
        dataset, map, measureControls, rasterLayer, currentUnitPref,
        vizParamsByPath: plantHealth.vizParamsByPath,
        refreshRasterLayers: () => plantHealth.refreshRasterLayers,
        onRasterProfileHover: () => undefined
    });
    const stockpile = useStockpileVolume({
        dataset, map, measureControls, currentUnitPref,
        deletedMeasurementIds: measurements.deletedMeasurementIds,
        rasterFilePath: raster.rasterFilePath,
        getMapCenterLatLon: () => getMapCenterLatLon
    });
    const contours = useContourLines({
        dataset, measureControls, rasterFilePath: raster.rasterFilePath,
        showAlert, showFlash
    });
    const tooltip = useMapTooltip({ map, vectorLayers, dialogs: () => dialogs });

    const panels = useMapPanels({
        plantHealth: { visible: () => plantHealth.plantHealthVisible.value, open: plantHealth.openPlantHealth, close: plantHealth.closePlantHealth },
        rasterAnalysis: { visible: () => raster.rasterPanelVisible.value, open: raster.openRasterAnalysis, close: raster.closeRasterAnalysis },
        stockpile: { visible: () => stockpile.stockpilePanelVisible.value, open: stockpile.openStockpileVolume, close: stockpile.closeStockpileVolume }
    });

    // The drawn rasters the analysis tools accept, top first. Placeholders are not drawn
    const analysisCandidates = () => rasters.rasterLayerList.value
        .filter(row => row.olLayer && !row.placeholder)
        .map(row => {
            const file = props.files.find(f => f.entry && f.entry.path === row.path) || row.olLayer.file;
            return { path: row.path, label: row.name, entry: file && file.entry, file };
        })
        .filter(c => c.entry && isRasterAnalysisCapable(c.entry));
    const confirm = useConfirm(dialogs);
    const analysisTarget = useAnalysisTarget({
        candidates: analysisCandidates,
        measurementsPath: () => measurements.measurementsRasterPath(),
        measurementsPathFor: entry => measurements.measurementEntryFor(entry).path,
        isDirty: () => !!measureControls.value && measureControls.value.isDirty(),
        confirmDiscard: file => confirm({
            title: 'Discard measurements',
            message: `Discard the unsaved measurements of ${escapeHtml(file)}?`,
            confirmText: 'Discard',
            cancelText: 'Cancel',
            danger: true
        }),
        reloadMeasurements: () => measurements.loadSavedMeasurements(),
        splitMode: () => split.splitMode.value,
        panels: {
            openKind: () => panels.openAmong(ANALYSIS_PANELS),
            open: (kind, file) => panels.open(kind, file),
            close: kind => panels.close(kind)
        }
    });

    return {
        map, measureControls, rasterLayer, vectorLayers, currentUnitPref, dialogs,
        ...alerts,
        ...useMapBasemap(map),
        ...measurements, ...plantHealth, ...raster, ...stockpile, ...contours, ...tooltip, ...rasters, ...split,
        // Opening an analysis panel closes the others
        openPlantHealth: (...args) => panels.open('plantHealth', ...args),
        openRasterAnalysis: (...args) => panels.open('rasterAnalysis', ...args),
        openStockpileVolume: (...args) => panels.open('stockpile', ...args),
        // The raster the Raster Analysis and Stockpile Volume tools work on (null until the first
        // is opened), the rasters to choose from, and what the toolbar and the selector call
        analysisTargetPath: analysisTarget.targetPath,
        analysisCandidates: computed(() => analysisTarget.candidates.value.map(({ path, label }) => ({ path, label }))),
        analysisEntry: analysisTarget.toolbarEntry,
        toggleAnalysisPanel: analysisTarget.requestToggle,
        selectAnalysisTarget: analysisTarget.requestSwitch,
        // What a view records: the model the tools pick when none was chosen, and a saved choice put back without a question
        defaultAnalysisTarget: analysisTarget.defaultTarget,
        restoreAnalysisTarget: analysisTarget.restoreTarget,
        // After the layers were rebuilt: a target that left the map is replaced
        reconcileAnalysisTarget: analysisTarget.onCandidatesChanged
    };
}
