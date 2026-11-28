/**
 * Measurements documents (as measurementFormat reads them: 3.0), definitions and inputs for the specs of the report
 * model. Every function returns a new object.
 */
import { newDefinition } from '@/libs/reports/reportDefinition';
import { DEFAULT_TEMPLATE, DEFAULT_SCHEMA, cloneSettings } from '@/libs/reports/reportSettings';
import { defaultState, newLayer } from '@/libs/views/viewState';

/** A square of the given side in metres around a point (a small one: its geodesic area is about side²). */
export function square(lon, lat, side) {
    const dLat = side / 111320 / 2;
    const dLon = side / (111320 * Math.cos((lat * Math.PI) / 180)) / 2;
    return {
        type: 'Polygon',
        coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]]
    };
}

/** A 2D feature of the map (its geometry is in WGS84). */
export function mapFeature(id, ref, measurementType, geometry, props = {}) {
    return {
        type: 'Feature',
        id,
        geometry,
        properties: { id, ...(ref === null ? {} : { ref }), measurementType, createdAt: '2026-11-01T10:00:00.000Z', ...props }
    };
}

/** A feature of the 3D viewer: it has local coordinates. */
export function cloudFeature(id, ref, measurementType, geometry, props = {}) {
    return mapFeature(id, ref, measurementType, geometry, { localCoordinates: [[1, 2, 3]], ...props });
}

/** A measurements document of the 3.0 format. */
export function documentOf(features, { crs = true, legacyGeometry = false, groups = [], pointCloudFile = 'cloud.laz' } = {}) {
    return {
        type: 'FeatureCollection',
        ...(crs ? { crs: { type: 'name', properties: { name: 'EPSG:4326' } } } : {}),
        metadata: {
            version: '3.0',
            application: 'DroneDB Registry',
            views: {
                ...(groups.length ? { map: { groups } } : {}),
                pointCloud: { pointCloudFile, ...(legacyGeometry ? { legacyGeometry: true } : {}) }
            }
        },
        features
    };
}

/** The template the specs use, with its own sections and a logo. */
export function template(extra = {}) {
    return { ...cloneSettings(DEFAULT_TEMPLATE), ...extra };
}

export function settings(extra = {}) {
    return { templates: [template()], schema: cloneSettings(DEFAULT_SCHEMA), ...extra };
}

/** A definition with the given sources (files, labelled A, B, ...) and the cover view of the saved view `v_cover`. */
export function definitionOf(files = ['a.geojson'], extra = {}) {
    return {
        ...newDefinition({ template: template(), name: 'North pit', sources: files, cover: { viewId: 'v_cover' } }),
        uid: 'r_k3x9q2m7',
        title: 'Inspection',
        ...extra
    };
}

/** The state of a cover view of an orthophoto (and, with `dsm`, an elevation model above it). */
export function coverState({ dsm = false } = {}) {
    const state = defaultState({ path: 'ortho.tif', hash: 'h1' }, { baseIsGeoraster: true });
    state.layers = [newLayer('ortho.tif', { hash: 'h1', opacity: 0.8, vizParams: { rescale: [0, 255] } })];
    if (dsm) state.layers.push(newLayer('dsm.tif', { hash: 'h2', opacity: 0.5 }));
    return state;
}

export const DSM_INFO = { bandCount: 1, dataType: 'Float32', isThermal: false };
export const ORTHO_INFO = { bandCount: 3, dataType: 'Byte', isThermal: false };

/** The time of the specs: noon on 15 November 2026, local. */
export const NOW = new Date(2026, 10, 15, 12, 0, 0);

/** The input of a model with one 2D source holding the given features. */
export function inputOf(features, extra = {}) {
    return {
        definition: definitionOf(['a.geojson']),
        sources: [{ file: 'a.geojson', document: documentOf(features) }],
        settings: settings(),
        coverView: { state: coverState() },
        now: NOW,
        datasetName: 'North pit dataset',
        links: { reportUrl: 'https://hub.example/r/acme/north/reports/r_k3x9q2m7', viewerUrl: item => `/viewer/${item.id}` },
        ...extra
    };
}

/** The blocks of a section of a model, by type. */
export const blocksOf = (model, kind, type) => model.sections.find(s => s.kind === kind)?.blocks.filter(b => !type || b.type === type) ?? [];
