// @ts-check
/**
 * What a raster profile (the answer of dataset.getRasterProfile) says about the series it samples: its samples, the
 * ones that have a value and the range the value axis shows. The profile panel draws them as SVG and the report as an
 * image, so both read the series through these.
 *
 * @typedef {{ distance: number, value: number | null, lon?: number, lat?: number }} ProfileSample
 * @typedef {{ samples?: ProfileSample[], min?: number | null, max?: number | null, totalLength?: number, unit?: string }} RasterProfile
 */

/** The samples of a profile, along the line. @param {RasterProfile | null | undefined} profile @returns {ProfileSample[]} */
export const profileSamples = profile => (profile && Array.isArray(profile.samples) ? profile.samples : []);

/** The samples that have a value (a sample with none is nodata). @param {RasterProfile | null | undefined} profile @returns {ProfileSample[]} */
export const validProfileSamples = profile => profileSamples(profile).filter(s => s && s.value !== null && s.value !== undefined);

/**
 * The range of the value axis: the minimum and maximum the server reports, else those of the samples that have a
 * value (0 to 1 when there is none).
 * @param {RasterProfile | null | undefined} profile
 * @returns {{ min: number, max: number }}
 */
export function profileRange(profile) {
    const valid = validProfileSamples(profile);
    const values = valid.map(s => /** @type {number} */ (s.value));
    const min = profile && profile.min !== null && profile.min !== undefined ? profile.min : values.length ? Math.min(...values) : 0;
    const max = profile && profile.max !== null && profile.max !== undefined ? profile.max : values.length ? Math.max(...values) : 1;
    return { min, max };
}
