/**
 * useMapFeatures - the features of the dataset map, wired together (HQ-07, the
 * composition root of MapCore): measurements, plant health, raster analysis, stockpile
 * volume, contours, tooltip, basemap, the raster list, split compare and alerts.
 *
 * Features share the OpenLayers objects as refs (`map`, `measureControls`, `rasterLayer`,
 * `vectorLayers`, filled by the view when it builds the map) and never call each other:
 * the analysis panels open through useMapPanels, one at a time.
 *
 *   setup(props) { return { ...useMapFeatures(props), ... }; }
 */
import { shallowRef, ref, computed } from 'vue';
import { toLonLat } from 'ol/proj';
import { getPref, PREF } from '@/libs/preferences';
import { isRasterAnalysisCapable } from '@/libs/entryTypes';
import { useDialogs } from '@/composables/useDialogs';
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

/**
 * @param {{ files: any[], dataset: any, canWrite: boolean, canDelete: boolean }} props
 */
export function useMapFeatures(props) {
    const map = shallowRef(null);
    const measureControls = shallowRef(null);
    const rasterLayer = shallowRef(null);
    const vectorLayers = shallowRef([]);
    const currentUnitPref = ref(getPref(PREF.MEASURE_UNIT, 'metric'));
    const dialogs = useDialogs();
    const alerts = useMapAlerts();
    const dataset = () => props.dataset;
    const showAlert = () => alerts.showAlert;
    const showFlash = () => alerts.showFlash;
    const getMapCenterLatLon = () => {
        const center = map.value && map.value.getView().getCenter();
        return center ? toLonLat(center) : null;
    };

    const measurements = useMapMeasurements({
        canWrite: () => props.canWrite, canDelete: () => props.canDelete, measureControls, currentUnitPref,
        files: () => props.files, dataset, showAlert, showFlash
    });
    const plantHealth = usePlantHealth({ dataset, rasterLayer, entry: () => null });
    const raster = useRasterAnalysis({
        dataset, map, measureControls, rasterLayer,
        vizParamsByPath: plantHealth.vizParamsByPath,
        refreshRasterLayers: () => plantHealth.refreshRasterLayers,
        onRasterProfileHover: () => undefined
    });
    const stockpile = useStockpileVolume({
        dataset, map, measureControls, currentUnitPref,
        deletedMeasurementIds: measurements.deletedMeasurementIds, hasSavedMeasurements: measurements.hasSavedMeasurements,
        rasterFilePath: raster.rasterFilePath,
        getMapCenterLatLon: () => getMapCenterLatLon
    });
    const contours = useContourLines({
        dataset, measureControls, rasterFilePath: raster.rasterFilePath,
        hasSavedMeasurements: measurements.hasSavedMeasurements, showAlert, showFlash
    });
    const tooltip = useMapTooltip({ map, vectorLayers, dialogs: () => dialogs });

    const panels = useMapPanels({
        plantHealth: { visible: () => plantHealth.plantHealthVisible.value, open: plantHealth.openPlantHealth, close: plantHealth.closePlantHealth },
        rasterAnalysis: { visible: () => raster.rasterPanelVisible.value, open: raster.openRasterAnalysis, close: raster.closeRasterAnalysis },
        stockpile: { visible: () => stockpile.stockpilePanelVisible.value, open: stockpile.openStockpileVolume, close: stockpile.closeStockpileVolume }
    });

    const rasters = useRasterLayers({
        group: rasterLayer, vectorLayers, splitMode: () => split.splitMode.value,
        displayName: layer => tooltip.getLayerDisplayName(layer)
    });
    const split = useMapSplitCompare({ map, rasterLayers: rasters.rasterLayerList, onChange: rasters.updateRastersOpacity });

    return {
        map, measureControls, rasterLayer, vectorLayers, currentUnitPref, dialogs,
        ...alerts,
        ...useMapBasemap(map),
        ...measurements, ...plantHealth, ...raster, ...stockpile, ...contours, ...tooltip, ...rasters, ...split,
        // Opening an analysis panel closes the others
        openPlantHealth: (...args) => panels.open('plantHealth', ...args),
        openRasterAnalysis: (...args) => panels.open('rasterAnalysis', ...args),
        openStockpileVolume: (...args) => panels.open('stockpile', ...args),
        toggleAnalysisPanel: panels.toggle,
        // The file the toolbar's Raster Analysis / Stockpile tools open for
        analysisFile: computed(() => props.files.find(x => x.entry && isRasterAnalysisCapable(x.entry)) || null)
    };
}
