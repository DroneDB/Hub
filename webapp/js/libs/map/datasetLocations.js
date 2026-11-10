// @ts-check
/**
 * datasetLocations - the pins of the overview map: where each dataset is, built from the
 * locations the server gives per organization.
 *
 * A dataset with a location (datasetPlaces) is pinned at the point the server gives for it (a position of
 * its data in the densest cluster of it, FR-ORG-09) or, when it gives none (a dataset of one place), at the
 * centre of its box. It keeps the box, which the map draws on demand.
 */
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { transformExtent } from 'ol/proj';
import { getCenter } from 'ol/extent';
import { EPSG } from '@/libs/constants';
import { getVectorColor } from '@/libs/map/mapUtils';
import { datasetName, groupName, isUsableBbox } from '@/libs/map/datasetPlaces';

/** @typedef {import('./datasetPlaces').LocationGroup} LocationGroup */

/**
 * A WGS84 box in Web Mercator (the map's projection). The poles have no Web Mercator: the
 * latitude is held to the range the projection covers.
 * @param {number[]} bbox  minLon, minLat, maxLon, maxLat
 * @returns {number[]} minX, minY, maxX, maxY
 */
export function bboxExtent(bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const limit = 85.05112878;
    return transformExtent([minLon, Math.max(minLat, -limit), maxLon, Math.min(maxLat, limit)], EPSG.WGS84, EPSG.WEB_MERCATOR);
}

/**
 * Where a dataset is pinned, in Web Mercator: its `point` ([lon, lat]) when the server gave a usable one inside its
 * box, else the centre of its box. The centre of the box of a dataset with data in several places is in the sea
 * between them.
 * @param {{ bbox: number[], point?: number[]|null }} dataset  a dataset with a usable box
 * @returns {number[]}
 */
export function pinCoordinate(dataset) {
    const { bbox, point } = dataset;
    if (isUsablePoint(point)) return getCenter(bboxExtent([point[0], point[1], point[0], point[1]]));
    return getCenter(bboxExtent(bbox));
}

/** @param {unknown} point @returns {point is number[]} a longitude and a latitude of the earth */
function isUsablePoint(point) {
    return Array.isArray(point) && point.length === 2 && point.every(v => typeof v === 'number' && Number.isFinite(v))
        && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

/**
 * The colour of each organization of `slugs`, given by its place among them sorted (by code
 * point, the same in every browser): an organization keeps its colour whatever order the answers
 * arrive in and whichever of them a search leaves on the map, and no two share one while they are
 * no more than the palette has colours (beyond, getVectorColor derives one from the slug).
 * @param {Iterable<string>} slugs
 * @returns {Record<string, string>} organization slug -> colour
 */
export function organizationColours(slugs) {
    /** @type {Record<string, string>} */
    const colours = {};
    [...new Set(slugs)].sort().forEach((slug, index) => getVectorColor(slug, index, colours));
    return colours;
}

/**
 * The pins of the groups and the legend of their organizations, each organization in its colour
 * of `colours` (organizationColours). By default the colours are those of the groups' own
 * organizations; a page that shows a changing subset of the organizations it knows passes the
 * colours of all of them, so a colour does not depend on the subset. An organization missing from
 * `colours` takes the colour derived from its slug, never one of the palette another may hold.
 * @param {LocationGroup[]} groups
 * @param {Record<string, string>} [colours]
 * @returns {{
 *   features: Feature<Point>[],
 *   legend: Array<{org: string, orgName: string, colour: string}>
 * }}
 */
export function buildLocations(groups, colours = organizationColours(groups.map(group => group.org))) {
    /** @type {Feature<Point>[]} */
    const features = [];
    /** @type {Array<{org: string, orgName: string, colour: string}>} */
    const legend = [];

    for (const group of groups) {
        const orgName = groupName(group);
        const colour = colours[group.org] ?? getVectorColor(group.org, Number.POSITIVE_INFINITY, {});
        let pinned = 0;
        for (const dataset of group.datasets ?? []) {
            if (!isUsableBbox(dataset.bbox)) continue;
            const name = datasetName(dataset);
            const feature = new Feature(new Point(pinCoordinate({ bbox: dataset.bbox, point: dataset.point })));
            feature.setId(`${group.org}/${dataset.slug}`);
            feature.setProperties({ org: group.org, orgName, slug: dataset.slug, name, bbox: dataset.bbox, colour });
            features.push(feature);
            pinned++;
        }
        if (pinned > 0) legend.push({ org: group.org, orgName, colour });
    }
    return { features, legend };
}
