// @ts-check
/**
 * datasetPlaces - which datasets of the locations the server gives per organization have a place
 * on the earth, and the names shown for them. It loads no OpenLayers: a page asks it which
 * datasets have no location without loading the map.
 *
 * A dataset has a location when the server gives it a bounding box (minLon, minLat, maxLon,
 * maxLat in WGS84) that is a real place; the others are "without a location".
 */

/**
 * @typedef {object} LocatedDataset
 * @property {string} slug
 * @property {string|null} [name]
 * @property {string|null} [tagline]  what the dataset list's search also matches (FR-ORG-10)
 * @property {number[]|null} [bbox]
 * @property {number[]|null} [point]  where to pin it, [lon, lat]: a position of its data (none: the centre of the box)
 *
 * @typedef {object} LocationGroup  the datasets of one organization, as the server lists them
 * @property {string} org  slug of the organization
 * @property {string} [orgName]
 * @property {LocatedDataset[]} datasets
 *
 * @typedef {object} UnlocatedDataset
 * @property {string} org
 * @property {string} orgName
 * @property {string} slug
 * @property {string} name
 */

/**
 * Whether `bbox` is a place on the earth: four finite numbers inside the WGS84 range, the
 * minimum not above the maximum (a box across the antimeridian is not given that way), and not
 * all zero (what a dataset with no location reports).
 * @param {unknown} bbox
 * @returns {bbox is number[]}
 */
export function isUsableBbox(bbox) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;
    if (!bbox.every(v => typeof v === 'number' && Number.isFinite(v))) return false;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    if (bbox.every(v => v === 0)) return false;
    if (minLon > maxLon || minLat > maxLat) return false;
    return Math.abs(minLon) <= 180 && Math.abs(maxLon) <= 180 && Math.abs(minLat) <= 90 && Math.abs(maxLat) <= 90;
}

/** The name shown for an organization: its name, else its slug. @param {LocationGroup} group */
export const groupName = group => group.orgName || group.org;

/** The name shown for a dataset: its name, else its slug. @param {LocatedDataset} dataset */
export const datasetName = dataset => dataset.name || dataset.slug;

/**
 * Whether the dataset matches the text of the search, as the server's search of the dataset list does (FR-ORG-10): the
 * text, trimmed and without regard to case, is in its name, its slug or its tagline. An empty text matches every dataset.
 * @param {LocatedDataset} dataset
 * @param {string} text
 */
export function datasetMatchesSearch(dataset, text) {
    const term = text.trim().toLowerCase();
    if (!term) return true;
    return [dataset.name, dataset.slug, dataset.tagline].some(field => !!field && field.toLowerCase().includes(term));
}

/**
 * The datasets of the groups that have no usable box, in the order of the groups.
 * @param {LocationGroup[]} groups
 * @returns {UnlocatedDataset[]}
 */
export function unlocatedDatasets(groups) {
    return groups.flatMap(group => (group.datasets ?? [])
        .filter(dataset => !isUsableBbox(dataset.bbox))
        .map(dataset => ({ org: group.org, orgName: groupName(group), slug: dataset.slug, name: datasetName(dataset) })));
}
