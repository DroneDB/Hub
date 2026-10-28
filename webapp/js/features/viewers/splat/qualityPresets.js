// @ts-check
/**
 * The quality of the splat viewer: three presets (low, medium, high) and "auto", which draws at
 * the preset the device keeps up with (qualityGovernor). A preset is the four things that decide
 * how much the GPU draws:
 *
 *  - `maxSh`: the spherical-harmonics degree of the view-dependent colour (0 = flat colour);
 *  - `lodScale`: the level-of-detail scale of the mesh, how fine the splats picked for the view are;
 *  - `lodSplatScale`: the share of the platform's splat budget Spark spends on the level of detail
 *    (1 = its default for the device: 2.5 million splats on a desktop, less on a phone), a scale
 *    instead of a count so a preset means the same thing on every device;
 *  - `pixelRatio`: the cap on the pixel ratio the canvas is drawn at.
 *
 * Spark 2.1 reads all of them again every frame (`maxSh` once the mesh is told its pipeline
 * changed), so a preset takes effect on a scene that is already open.
 */
import { PREF, PREF_CHOICES, prefChoice } from '@/libs/preferences';
import { initialGovernor, stepGovernor } from './qualityGovernor';

/** The presets from the lowest, which is the order the governor steps through. */
export const QUALITY_LEVELS = /** @type {const} */ (['low', 'medium', 'high']);

/** @typedef {typeof QUALITY_LEVELS[number]} QualityLevel */
/** @typedef {{ maxSh: number, lodScale: number, lodSplatScale: number, pixelRatio: number }} QualityPreset */

/** @type {Readonly<Record<QualityLevel, Readonly<QualityPreset>>>} */
export const QUALITY_PRESETS = Object.freeze({
    low: Object.freeze({ maxSh: 0, lodScale: 0.5, lodSplatScale: 0.25, pixelRatio: 1 }),
    medium: Object.freeze({ maxSh: 1, lodScale: 0.75, lodSplatScale: 0.5, pixelRatio: 1.5 }),
    high: Object.freeze({ maxSh: 3, lodScale: 1, lodSplatScale: 1, pixelRatio: 2 })
});

const LABELS = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };

/** The choices of the quality select (Preferences and the viewer's settings): one place for the labels. */
export const QUALITY_CHOICES = Object.freeze(PREF_CHOICES[PREF.SPLAT_QUALITY].map(value => ({ value, label: LABELS[value] })));

/**
 * The quality in words: a preset's label, or in auto the preset it is drawing at.
 * @param {string} setting  'auto' or a preset
 * @param {string} level    the preset in force
 */
export function describeQuality(setting, level) {
    const label = (/** @type {string} */ key) => LABELS[/** @type {keyof typeof LABELS} */ (key)] ?? key;
    return setting === 'auto' ? `Auto (${label(level).toLowerCase()})` : label(setting);
}

/** The settings of a preset by name. @param {QualityLevel} level */
export const presetOf = level => QUALITY_PRESETS[level];

/**
 * The quality the viewer draws at. `setting` is the user's choice ('auto' or a preset); `frame()`
 * is called with the time of every frame and, in auto, lowers or raises the level. `apply` gets
 * the preset to put in force, whenever the level changes (and once at the start).
 *
 * @param {object} options
 * @param {(preset: Readonly<QualityPreset>, level: QualityLevel) => void} options.apply
 * @param {unknown} [options.setting]       the stored choice; one that is not a choice is auto
 * @param {(level: QualityLevel) => void} [options.onLevel]  told when the level in force changes
 */
export function createQualityController({ apply, setting, onLevel }) {
    const top = QUALITY_LEVELS.length - 1;
    let choice = prefChoice(PREF.SPLAT_QUALITY, setting);
    let governor = initialGovernor(top);
    /** @type {QualityLevel | null} */
    let current = null;

    const levelOf = () => (choice === 'auto' ? QUALITY_LEVELS[governor.level] : /** @type {QualityLevel} */ (choice));

    function put() {
        const level = levelOf();
        if (level === current) return;
        current = level;
        apply(QUALITY_PRESETS[level], level);
        onLevel?.(level);
    }

    return {
        /** Puts the quality in force; call it once the scene exists, and again if it is replaced. */
        start() {
            current = null;
            put();
        },
        /** @param {unknown} value  'auto' or a preset name; anything else is auto */
        setSetting(value) {
            const next = prefChoice(PREF.SPLAT_QUALITY, value);
            if (next === choice) return;
            choice = next;
            // Auto starts again from the top: what was measured at another level says nothing now
            governor = initialGovernor(top);
            put();
        },
        /** The time the last frame took, in ms. Only auto reads it. @param {number} frameMs */
        frame(frameMs) {
            if (choice !== 'auto') return;
            const step = stepGovernor(governor, frameMs);
            governor = step.state;
            if (step.change !== 0) put();
        },
        get setting() { return choice; },
        /** The level in force (in auto, the one the governor is at). */
        get level() { return levelOf(); }
    };
}
