// @ts-check
/**
 * The format of the measurements file (`<name>_measurements.geojson`): the one place that reads and
 * writes it, for the 2D map, the 3D point-cloud viewer and the stockpile panel (FR-XC-30, D-016).
 *
 * A file is a GeoJSON FeatureCollection whose `metadata` holds the format version (2.0; the writers
 * before it wrote 1.0 and 1.1), the application ('DroneDB Registry'), `createdAt` (kept by every save),
 * `modifiedAt` (set by every save) and `views`: what belongs to one view only, under the view's key
 * (`views.map`: groups, unitPreference, orthophotoFile; `views.pointCloud`: pointCloudFile,
 * coordinateSystem). The features of the two views are in the same list (see ownerOf).
 *
 *   read(json, ctx)                                the file as a 2.0 document, migrated in memory; never writes
 *   write(existing, view, ownFeatures, ownSection)  a 2.0 document: the view's features and section replaced,
 *                                                   the other view's kept
 *
 * Files before 2.0 are migrated on every read (the next save writes the result, a read never does):
 *  - the top-level `metadata.groups`, `orthophotoFile` and `unitPreference` are the map's (they move to
 *    `views.map`; the groups only when the key is there, as a save of an older Hub over a 2.0 file
 *    writes them again), `pointCloudFile` and `coordinateSystem` the 3D viewer's (`views.pointCloud`);
 *  - the geometry of the 3D viewer's features is worked out again from their `localCoordinates` (the
 *    version before 2.0 added the scale and offset of the cloud twice), with the CRS the file states or
 *    else the one of the point cloud the caller passes (`ctx.pointCloudCrs`). Without a CRS proj4 can
 *    use (the 2D map does not know the cloud's), those features stay as they were, the file has no
 *    `crs` member and `views.pointCloud.legacyGeometry` says that their geometry is still to be worked
 *    out: a later read with a CRS (the 3D viewer's) does it, in a 2.0 file too, and drops the mark.
 * A migration changes nothing in a 2.0 file without that mark, so the second one of a file is the same
 * as the first.
 * Older Hubs read `features` and ignore `metadata.views`.
 */
import { EPSG } from '@/libs/constants';
import { projectorFor, geometryOf, localPointsOf } from '@/libs/map/pointCloudGeometry';

export const FORMAT_VERSION = '2.0';
/** The application id of every file the Hub writes. */
export const APPLICATION_ID = 'DroneDB Registry';
/** What the files of the earlier writers say in `metadata.application`: the 3D viewer, the stockpile and orthophoto panels. */
const ACCEPTED_APPLICATIONS = new Set([APPLICATION_ID, 'Registry-Potree', 'Registry-Stockpile', 'Registry-Orthophoto']);

/** The views that keep measurements in the same file: the 2D map and the 3D point-cloud viewer. */
export const VIEW = Object.freeze({ MAP: 'map', POINT_CLOUD: 'pointCloud' });

// Types that only the 3D viewer writes
const POINT_CLOUD_TYPES = new Set(['distance', 'height', 'circle', 'angle', 'annotation']);

/**
 * In `views.pointCloud`: the 3D viewer's features still have the geometry a writer before 2.0 gave them,
 * because the file was migrated (and saved, by the 2D map) with no CRS to work it out with.
 */
export const LEGACY_GEOMETRY = 'legacyGeometry';

// What the files before 2.0 kept at the top of `metadata` that belongs to one view
const LEGACY_VIEW_KEYS = Object.freeze({
    [VIEW.MAP]: ['groups', 'orthophotoFile', 'unitPreference'],
    [VIEW.POINT_CLOUD]: ['pointCloudFile', 'coordinateSystem']
});

/** A file that cannot be used: `code` is 'unreadable' (not GeoJSON of measurements), 'foreign' (written by another application) or 'unsupported' (a newer format). */
export class MeasurementFileError extends Error {
    /**
     * @param {'unreadable' | 'foreign' | 'unsupported'} code
     * @param {string} message
     * @param {ErrorOptions} [options]
     */
    constructor(code, message, options) {
        super(message, options);
        this.name = 'MeasurementFileError';
        this.code = code;
    }
}

/**
 * The members of an object except the named ones.
 * @param {Record<string, any>} object
 * @param {string[]} names
 * @returns {Record<string, any>}
 */
const without = (object, names) => Object.fromEntries(Object.entries(object).filter(([key]) => !names.includes(key)));

/** @param {any} v @returns {v is Record<string, any>} */
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The view a saved feature belongs to. The 3D viewer writes the local coordinates of every
 * feature (points and areas included, which the map also has); everything else is the map's.
 * @param {any} feature  GeoJSON feature
 * @returns {string} a VIEW
 */
export function ownerOf(feature) {
    const props = (feature && feature.properties) || {};
    return props.localCoordinates || POINT_CLOUD_TYPES.has(props.measurementType) ? VIEW.POINT_CLOUD : VIEW.MAP;
}

/**
 * The section of a view in a document.
 * @param {any} doc
 * @param {string} view  a VIEW
 * @returns {Record<string, any>}
 */
export function sectionOf(doc, view) {
    const section = doc && doc.metadata && doc.metadata.views && doc.metadata.views[view];
    return isObject(section) ? section : {};
}

/** @param {any} value @returns {[number, number]} major and minor of a version, 1.0 when it has none */
function versionOf(value) {
    const match = /^(\d+)(?:\.(\d+))?/.exec(String(value ?? '').trim());
    return match ? [Number(match[1]), Number(match[2] || 0)] : [1, 0];
}

/** The first of the candidates (each an SRS or a coordinate system) that proj4 can use. @param {any[]} candidates */
function usableProjector(candidates) {
    for (const candidate of candidates) {
        const projector = projectorFor(candidate);
        if (projector.usable) return projector;
    }
    return projectorFor(null);
}

/** @param {any} feature */
const isLocated = feature => ownerOf(feature) === VIEW.POINT_CLOUD && !!localPointsOf(feature);

/**
 * The document with the `crs` member it deserves: WGS84 when every geometry in it is, none when a
 * point-cloud feature holds local coordinates, or the geometry of a writer before 2.0, because no CRS
 * proj4 can use is known for the cloud.
 * @param {Record<string, any>} doc
 */
function withCrs(doc) {
    const rest = without(doc, ['crs']);
    const unreferenced = doc.features.some(isLocated) && !projectorFor(sectionOf(doc, VIEW.POINT_CLOUD).coordinateSystem).usable;
    if (unreferenced) return rest;
    const { type, ...others } = rest;
    return { type, crs: { type: 'name', properties: { name: EPSG.WGS84 } }, ...others };
}

/**
 * The file as a 2.0 document, migrated in memory (the file itself is not touched). A 2.0 file marked
 * LEGACY_GEOMETRY gets its 3D geometry worked out here too, when a CRS is known.
 * @param {any} json  the parsed file
 * @param {{ pointCloudCrs?: any }} [ctx]  `pointCloudCrs`: the SRS (or the coordinate system) of the point cloud
 *   the file belongs to, used when the file states none that proj4 can use
 * @returns {Record<string, any>}
 * @throws {MeasurementFileError} when the file is not a measurements file, or is of another application or a newer format
 */
export function read(json, ctx = {}) {
    if (!isObject(json) || !Array.isArray(json.features)) {
        throw new MeasurementFileError('unreadable', 'The measurements file is not a GeoJSON FeatureCollection');
    }
    const metadata = isObject(json.metadata) ? json.metadata : {};
    if (metadata.application !== undefined && !ACCEPTED_APPLICATIONS.has(metadata.application)) {
        throw new MeasurementFileError('foreign', `The file belongs to another application (${String(metadata.application)})`);
    }
    const [major] = versionOf(metadata.version);
    if (major > 2) {
        throw new MeasurementFileError('unsupported', `The measurements file is of a newer format (${String(metadata.version)})`);
    }
    if (major === 2) {
        const doc = { ...json, metadata: { ...metadata, views: isObject(metadata.views) ? metadata.views : {} } };
        return sectionOf(doc, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY] ? withLegacyGeometryCorrected(doc, ctx) : doc;
    }
    return migrate(json, metadata, ctx);
}

/**
 * The 3D viewer's features with their geometry worked out again from their local coordinates, and
 * the section of the 3D viewer that says where it came from. With no CRS proj4 can use (from the
 * section or `ctx`), the features stay as they are and the section is marked LEGACY_GEOMETRY.
 * @param {any[]} features  all the features of the file (the map's are kept as they are)
 * @param {Record<string, any>} cloud  the section of the 3D viewer
 * @param {{ pointCloudCrs?: any }} ctx
 * @returns {{ features: any[], section: Record<string, any> }}
 */
function correctedGeometry(features, cloud, ctx) {
    const section = without(cloud, [LEGACY_GEOMETRY]);
    if (!features.some(isLocated)) return { features, section };
    const projector = usableProjector([cloud.coordinateSystem, ctx.pointCloudCrs]);
    if (!projector.usable) return { features, section: { ...section, [LEGACY_GEOMETRY]: true } };
    if (!projectorFor(cloud.coordinateSystem).usable) {
        // Where the corrected geometry comes from stays in the file
        section.coordinateSystem = { ...(isObject(cloud.coordinateSystem) ? cloud.coordinateSystem : {}), srs: projector.definition };
    }
    return {
        section,
        features: features.map(feature => {
            const points = isLocated(feature) ? localPointsOf(feature) : null;
            if (!points) return feature;
            const geometry = geometryOf(feature.properties.measurementType, points.map(p => projector.toGeographic(p)));
            return geometry ? { ...feature, geometry } : feature;
        })
    };
}

/**
 * A 2.0 document whose 3D features still have their old geometry (LEGACY_GEOMETRY): corrected when a
 * CRS is known now, else as it is.
 * @param {Record<string, any>} doc
 * @param {{ pointCloudCrs?: any }} ctx
 */
function withLegacyGeometryCorrected(doc, ctx) {
    const { features, section } = correctedGeometry(doc.features, sectionOf(doc, VIEW.POINT_CLOUD), ctx);
    if (section[LEGACY_GEOMETRY]) return doc;
    const views = { ...doc.metadata.views, [VIEW.POINT_CLOUD]: section };
    return withCrs({ ...doc, metadata: { ...doc.metadata, views }, features });
}

/**
 * A file before 2.0 as a 2.0 document.
 * @param {Record<string, any>} json
 * @param {Record<string, any>} metadata
 * @param {{ pointCloudCrs?: any }} ctx
 */
function migrate(json, metadata, ctx) {
    const previousViews = metadata.views;
    const rest = without(metadata, ['views', 'version']);
    /** @type {Record<string, Record<string, any>>} */
    const sections = {};
    for (const view of Object.values(VIEW)) sections[view] = { ...sectionOf({ metadata }, view) };
    for (const [view, keys] of Object.entries(LEGACY_VIEW_KEYS)) {
        for (const key of keys) {
            if (!(key in rest)) continue;
            // Groups: an array only (the key is how a save of an older Hub says it has some)
            if (key !== 'groups' || Array.isArray(rest[key])) sections[view][key] = rest[key];
            delete rest[key];
        }
    }

    const { features, section: cloud } = correctedGeometry(json.features, sections[VIEW.POINT_CLOUD], ctx);
    sections[VIEW.POINT_CLOUD] = cloud;

    /** @type {Record<string, any>} */
    const views = isObject(previousViews) ? { ...previousViews } : {};
    for (const [view, section] of Object.entries(sections)) {
        if (Object.keys(section).length) views[view] = section;
    }
    const others = without(rest, ['application']);
    return withCrs({
        ...json,
        metadata: { version: FORMAT_VERSION, application: APPLICATION_ID, ...others, views },
        features
    });
}

/** @param {Record<string, any>} section the section without what has no value */
function cleanSection(section) {
    /** @type {Record<string, any>} */
    const clean = {};
    for (const [key, value] of Object.entries(isObject(section) ? section : {})) {
        if (value === undefined || value === null || (Array.isArray(value) && !value.length)) continue;
        clean[key] = value;
    }
    return clean;
}

/**
 * A 2.0 document: the view's features and section replaced by the given ones, everything of the other
 * view (its features and its section) kept, `createdAt` kept, `modifiedAt` now.
 * @param {Record<string, any> | null | undefined} existing  the file as `read` gives it, null for a new one
 * @param {string} view  a VIEW
 * @param {any[]} ownFeatures  the view's features, all of them (the ones of the file are replaced)
 * @param {Record<string, any>} [ownSection]  what belongs to the view only (a view with no features has no section)
 * @returns {Record<string, any>}
 */
export function write(existing, view, ownFeatures, ownSection = {}) {
    // A document that is not 2.0 yet is migrated first, so nothing is written in an old shape
    const previous = existing ? read(existing) : null;
    const previousMetadata = (previous && previous.metadata) || {};
    const previousFeatures = (previous && previous.features) || [];
    const members = without(previous || {}, ['type', 'crs', 'metadata', 'features']);
    const { createdAt, views: previousViews } = previousMetadata;
    const others = without(previousMetadata, ['version', 'application', 'kind', 'createdAt', 'modifiedAt', 'views']);
    const now = new Date().toISOString();

    const own = ownFeatures || [];
    const kept = previousFeatures.filter((/** @type {any} */ f) => ownerOf(f) !== view);
    /** @type {Record<string, any>} */
    const views = isObject(previousViews) ? { ...previousViews } : {};
    delete views[view];
    const section = own.length ? cleanSection(ownSection) : {};
    if (Object.keys(section).length) views[view] = section;

    return withCrs({
        type: 'FeatureCollection',
        ...members,
        metadata: {
            version: FORMAT_VERSION,
            kind: 'measurements',
            application: APPLICATION_ID,
            createdAt: createdAt ?? now,
            modifiedAt: now,
            ...others,
            views
        },
        features: [...own, ...kept]
    });
}

/**
 * The content of a file as a 2.0 document.
 * @param {any} content  what the dataset gives for the file: text or the parsed document
 * @param {{ pointCloudCrs?: any }} [ctx]
 * @returns {Record<string, any> | null}  null when the file is empty
 * @throws {MeasurementFileError} as `read`, and 'unreadable' for text that is not JSON
 */
export function parse(content, ctx = {}) {
    if (content === null || content === undefined) return null;
    if (typeof content === 'string' && !content.trim()) return null;
    let json = content;
    if (typeof content === 'string') {
        try {
            json = JSON.parse(content);
        } catch (e) {
            throw new MeasurementFileError('unreadable', 'The measurements file is not valid JSON', { cause: e });
        }
    }
    return read(json, ctx);
}
