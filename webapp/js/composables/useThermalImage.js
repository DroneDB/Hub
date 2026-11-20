// @ts-check
/**
 * useThermalImage - the thermal mode of the image viewer (FR-RAS-15, FR-XC-24): for a picture of a thermal camera, the
 * value info of its raw thermal grid (the range, its size, the calibration), the temperature under the pointer and the choices
 * of the Unit and the palette.
 *
 *   const thermal = useThermalImage({ dataset, path: () => path.value, entry: () => entry.value });
 *   thermal.available.value      // the picture is radiometric: show the controls
 *   thermal.notice.value         // a thermal picture without temperatures (no calibration): why it is shown as shot
 *   thermal.pointerAt(pixel)     // the pixel of the raw grid under the pointer (gridPixelAt), null off the picture
 *
 * The values come from ddb in the unit of the formula that was asked (D-022), the pointer is a pixel of the raw thermal grid
 * (an R-JPEG has no geotransform, §7.1), the requests of the pointer are throttled to one in flight with the last pixel kept,
 * and a late answer for another picture, unit or pixel is dropped. The unit and the palette stay while the viewer goes from
 * one picture to the next.
 */
import { ref, computed, watch, onScopeDispose } from 'vue';
import { isThermalEntry, isRadiometric, thermalReadout, thermalRangeText, thermalLegendStyle, uncalibratedThermalNotice,
    DEFAULT_THERMAL_FORMULA } from '@/libs/thermalImage';
import { thermalUnitOfFormula } from '@/libs/map/rasterUnit';

/**
 * @param {{ dataset: any, path: () => string, entry: () => any }} options  dataset: the Dataset of libs/ddb (getRasterValueInfo,
 *   getRasterPointValue); path and entry: the picture on show
 */
export function useThermalImage({ dataset, path, entry }) {
    const formula = ref(DEFAULT_THERMAL_FORMULA);
    // The colormap of the picture, '' as the camera shot it
    const palette = ref('');
    const info = ref(/** @type {import('@/libs/thermalImage').ThermalInfo|null} */ (null));
    const hover = ref(/** @type {{ x: number, y: number, text: string, value: number|null, unit: string }|null} */ (null));

    const wanted = computed(() => isThermalEntry(entry()) && !!path());
    const available = computed(() => wanted.value && isRadiometric(info.value));
    // A thermal picture whose value info has no temperatures (a DJI R-JPEG: raw counts without a unit)
    const notice = computed(() => (wanted.value ? uncalibratedThermalNotice(entry(), info.value) : ''));
    const unit = computed(() => thermalUnitOfFormula(formula.value));
    const rangeText = computed(() => thermalRangeText(info.value));
    const legendStyle = computed(() => (available.value ? thermalLegendStyle(palette.value, info.value, formula.value) : null));
    // The palette in force: the picture as shot when it is not radiometric
    const activePalette = computed(() => (available.value ? palette.value : ''));

    let infoToken = 0;
    // The pointer: the last pixel wins, one request at a time
    /** @type {{ x: number, y: number }|null} */
    let pending = null;
    let pumping = false;
    let pointerGeneration = 0;

    async function loadInfo() {
        const token = ++infoToken;
        if (!wanted.value) {
            info.value = null;
            return;
        }
        try {
            const answer = await dataset.getRasterValueInfo(path(), { formula: formula.value });
            if (token === infoToken) info.value = answer;
        } catch (e) {
            // Not a picture with raw thermal data (or the server cannot read it): a plain picture
            console.warn(`Failed to read the thermal value info of ${path()}:`, e);
            if (token === infoToken) info.value = null;
        }
    }

    // Another picture: nothing of the last one stays; another unit: the range follows, the controls stay
    watch([path, wanted], () => {
        info.value = null;
        hover.value = null;
        pending = null;
        pointerGeneration++;
        loadInfo();
    }, { immediate: true });
    watch(formula, () => {
        hover.value = null;
        pending = null;
        pointerGeneration++;
        loadInfo();
    });

    async function pump() {
        pumping = true;
        try {
            while (pending) {
                const pixel = pending;
                pending = null;
                const generation = pointerGeneration;
                try {
                    const point = await dataset.getRasterPointValue(path(), pixel.x, pixel.y, { formula: formula.value });
                    if (generation !== pointerGeneration) continue;
                    const readout = thermalReadout(point, unit.value);
                    hover.value = { x: pixel.x, y: pixel.y, text: readout.text, value: readout.value, unit: readout.unit };
                } catch {
                    // A pixel with no value, or the server did not answer: no reading for it
                    if (generation === pointerGeneration) hover.value = { x: pixel.x, y: pixel.y, text: '', value: null, unit: '' };
                }
            }
        } finally {
            pumping = false;
        }
    }

    /**
     * The pointer is over a pixel of the raw grid, or off the picture (null).
     * @param {{ x: number, y: number }|null} pixel
     */
    function pointerAt(pixel) {
        if (!available.value) return;
        if (!pixel) {
            pointerGeneration++;
            pending = null;
            hover.value = null;
            return;
        }
        if (hover.value && hover.value.x === pixel.x && hover.value.y === pixel.y) return;
        pending = pixel;
        if (!pumping) pump();
    }

    onScopeDispose(() => {
        infoToken++;
        pointerGeneration++;
        pending = null;
    });

    return { formula, palette, activePalette, info, hover, available, notice, unit, rangeText, legendStyle, pointerAt };
}
