// @ts-check
/**
 * The format of the measurements file (`<name>_measurements.geojson`): the one place that reads and
 * writes it, for the 2D map, the 3D point-cloud viewer and the stockpile panel.
 *
 * A file is a GeoJSON FeatureCollection whose `metadata` holds the format version (3.0; the writers
 * before it wrote 1.0, 1.1 and 2.0), the application ('DroneDB Registry'), `createdAt` (kept by every save),
 * `modifiedAt` (set by every save) and `views`: what belongs to one view only, under the view's key (`views.map`: groups, unitPreference,
 * orthophotoFile; `views.pointCloud`: pointCloudFile, coordinateSystem). The features of the two views are
 * in the same list (see ownerOf), and each has an `id` and a `ref` (annotationIds).
 *
 * Version 3.0 is 2.0 plus the `id` and `ref` of every feature and the inspection fields: a Hub that reads only
 * major version 2 refuses a 3.0 file instead of saving it without them. The next ref is worked out from the refs
 * of the file (annotationIds): the `metadata.lastRef` counter that earlier 3.0 writers kept is not read, and every
 * write leaves it out.
 *
 *   read(json, ctx)                                the file as a 3.0 document, migrated in memory; never writes.
 *                                                  A feature with no `id` has the one annotationIds gives it
 *   write(existing, view, ownFeatures, ownSection)  a 3.0 document: the view's features and section replaced,
 *                                                   the other view's kept
 *   writeNumbered(...)                              the same, for a save: every feature without a `ref`, of
 *                                                   either view, gets one (see its comment)
 *
 * Files before 2.0 are migrated on every read (the next save writes the result, a read never does):
 *  - the top-level `metadata.groups`, `orthophotoFile` and `unitPreference` are the map's (they move to
 *    `views.map`; the groups only when the key is there, as a save of an older Hub over a 2.0 file
 *    writes them again), `pointCloudFile` and `coordinateSystem` the 3D viewer's (`views.pointCloud`);
 *  - the geometry of the 3D viewer's features is worked out again from their `localCoordinates` (the
 *    version before 2.0 added the scale and offset of the cloud twice), with the CRS the file states or,
 *    when it states none, the one the caller passes (`ctx.pointCloudCrs`: the CRS the coordinates of the
 *    cloud were in when the file was written). A CRS the file states is never replaced by another one:
 *    its coordinates are in it. Without a CRS proj4 can use (the 2D map does not know the cloud's), those
 *    features stay as they were, the file has no `crs` member and `views.pointCloud.legacyGeometry` says
 *    that their geometry is still to be worked out: a later read with a CRS (the 3D viewer's) does it, in
 *    a 2.0 file too, and drops the mark.
 * A migration changes nothing in a 2.0 file without that mark, so the second one of a file is the same
 * as the first.
 * Older Hubs read `features` and ignore `metadata.views`.
 *
 * The CRS of a point cloud's COPC can change after its measurements were saved (a cloud in longitude and
 * latitude gets its COPC built again in UTM): savedPositions puts every saved feature where it belongs in
 * the CRS of the COPC the viewer has now.
 */
import { EPSG } from '@/libs/constants';
import { projectorFor, geometryOf, localPointsOf, srsDefinitionOf, sameCrs } from '@/libs/map/pointCloudGeometry';
import { backfillIds, assignRefs, renumberTaken, withoutStrayRefs, idOf, refOf } from '@/libs/map/annotationIds';
import { withSavedContours } from '@/libs/map/contourStorage';

export const FORMAT_VERSION = '3.0';
/** The newest major version this Hub reads: a file of a higher one is refused. */
const MAX_MAJOR = 3;
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
 * The file as a 3.0 document, migrated in memory (the file itself is not touched). A 2.0 or 3.0 file marked
 * LEGACY_GEOMETRY gets its 3D geometry worked out here too, when a CRS is known. The features without an `id`
 * get theirs first, from the file as it was written, before any geometry is worked out again. A contour line
 * is read as a saved contour (contourStorage.withSavedContours).
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
    if (major > MAX_MAJOR) {
        throw new MeasurementFileError('unsupported', `The measurements file is of a newer format (${String(metadata.version)})`);
    }
    // On the features as they were read: a later correction of their geometry must not change their ids. A contour
    // that an older Hub saved as a length is a contour again
    const identified = withSavedContours(backfillIds(json.features, ownerOf));
    const file = identified === json.features ? json : { ...json, features: identified };
    if (major >= 2) {
        const doc = { ...file, metadata: { ...metadata, views: isObject(metadata.views) ? metadata.views : {} } };
        return sectionOf(doc, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY] ? withLegacyGeometryCorrected(doc, ctx) : doc;
    }
    return migrate(file, metadata, ctx);
}

/**
 * The 3D viewer's features with their geometry worked out again from their local coordinates, and
 * the section of the 3D viewer that says where it came from. The CRS is the one the section states;
 * `ctx.pointCloudCrs` only when it states none (a stated CRS proj4 cannot use is not replaced: the
 * coordinates are in it, not in the cloud's). With no CRS proj4 can use, the features stay as they are
 * and the section is marked LEGACY_GEOMETRY.
 * @param {any[]} features  all the features of the file (the map's are kept as they are)
 * @param {Record<string, any>} cloud  the section of the 3D viewer
 * @param {{ pointCloudCrs?: any }} ctx
 * @returns {{ features: any[], section: Record<string, any> }}
 */
function correctedGeometry(features, cloud, ctx) {
    const section = without(cloud, [LEGACY_GEOMETRY]);
    if (!features.some(isLocated)) return { features, section };
    const stated = srsDefinitionOf(cloud.coordinateSystem);
    const projector = projectorFor(stated ?? ctx.pointCloudCrs);
    if (!projector.usable) return { features, section: { ...section, [LEGACY_GEOMETRY]: true } };
    if (!stated) {
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
 * A document whose 3D features still have their old geometry (LEGACY_GEOMETRY): corrected when a
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
 * A file before 2.0 as a 3.0 document.
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

/** Whether every geometry of a document is in WGS84 (its `crs` member says so: see withCrs). @param {any} doc */
const isWgs84Document = doc => doc?.crs?.properties?.name === EPSG.WGS84;

/**
 * The points of a feature's geometry ([longitude, latitude, height] in a WGS84 file), or null when it has none.
 * @param {any} feature
 * @returns {number[][] | null}
 */
function geometryPointsOf(feature) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'Point') return [geometry.coordinates];
    if (geometry?.type === 'LineString') return geometry.coordinates;
    if (geometry?.type === 'Polygon') return geometry.coordinates[0].slice(0, -1);
    return null;
}

/** A circle (its centre) and an angle (its vertex) have one of their points in their geometry, the other kinds all of them. @param {any} feature */
const geometryHoldsEveryPoint = feature => !['circle', 'angle'].includes(feature?.properties?.measurementType);

/**
 * Where the 3D viewer's saved features go in a point cloud whose COPC is in `coordinateSystem` now: a
 * function from a feature to its points ([x, y, z] of the COPC), or null for a feature that cannot be
 * placed there.
 *
 * The local coordinates of a feature are in the CRS the section of the file states. When that is the
 * CRS of the COPC (sameCrs: by meaning, not by text) they are used as they are; a file that states no
 * CRS has them in the coordinates of the COPC too (its migration gives it the CRS of the cloud when one
 * is known). When the file states another CRS (the COPC was built again in another one), every point goes
 * from that CRS to WGS84 and from there into the COPC's (in 3-D for a geocentric CRS). When the file's CRS
 * cannot be read but its geometry is WGS84, the geometry is placed in the COPC's CRS instead, except for a
 * circle or an angle, whose geometry is one of their points. A feature with no local coordinates is
 * placed from its geometry.
 *
 * A feature in another CRS that cannot be reprojected into the COPC's (one of the two CRSs is one proj4
 * cannot use) cannot be placed: its coordinates are not in the COPC's, and shown there they would be in
 * the wrong place, and saved there they would be labelled with a CRS they are not in. The caller leaves
 * them out of the view and refuses saves, so the file keeps them (MeasurementStorage.keepUnplaced).
 *
 * When neither the file's CRS nor the COPC's is one proj4 can use, they cannot be compared (the same CRS
 * is written as WKT 1 by one writer and WKT 2 by another) and nothing could have been reprojected: a COPC
 * is built again only in a CRS proj4 can use (the UTM zone of a cloud in longitude and latitude). The
 * local coordinates are then the COPC's, as they were saved.
 * @param {any} doc  the document (`read` or the storage's `load`)
 * @param {any} coordinateSystem  the coordinate system (or SRS) of the COPC the viewer shows
 * @returns {(feature: any) => number[][] | null}
 */
export function savedPositions(doc, coordinateSystem) {
    const saved = sectionOf(doc, VIEW.POINT_CLOUD).coordinateSystem;
    const current = projectorFor(coordinateSystem);
    const stated = projectorFor(saved);
    const statesCrs = !!srsDefinitionOf(saved);
    const wgs84 = isWgs84Document(doc);
    const features = Array.isArray(doc?.features) ? doc.features : [];
    const sample = features.map(localPointsOf).find(Boolean)?.[0] ?? null;
    // Two CRSs proj4 cannot use cannot be compared, and no build reprojects into one: the coordinates are the COPC's
    const comparable = stated.usable || current.usable;
    // A WGS84 file that states no CRS is placed from its geometry when the COPC has a CRS to place it in
    const unchanged = statesCrs ? !comparable || sameCrs(saved, coordinateSystem, sample) : !(wgs84 && current.usable);
    const fromLocal = !unchanged && current.usable && stated.usable;
    const fromGeometry = !unchanged && current.usable && wgs84;
    return feature => {
        const local = localPointsOf(feature);
        const geometry = geometryPointsOf(feature);
        if (unchanged) return local ?? (geometry ? geometry.map(p => current.toLocal(p)) : null);
        if (local && fromLocal) return local.map(p => current.toLocal(stated.toGeographic(p)));
        if (geometry && fromGeometry && (!local || geometryHoldsEveryPoint(feature))) return geometry.map(p => current.toLocal(p));
        // The local coordinates of a file that states no CRS are the COPC's
        if (local && !statesCrs) return local;
        return null;
    };
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
 * @typedef {object} Written
 * @property {Record<string, any>} document  the document to write
 * @property {Record<string, string>} refs  the `ref` of each feature of the view, by `id`
 * @property {{ id: string, from: string, to: string }[]} renumbered  the new features whose ref another session
 *   had used: they were given the next one
 */

/**
 * The document that a view's features make with the rest of the file (see write and writeNumbered).
 * @param {Record<string, any> | null | undefined} existing
 * @param {string} view
 * @param {any[]} ownFeatures
 * @param {Record<string, any>} ownSection
 * @param {{ numbered: boolean }} options
 * @returns {Written}
 */
function compose(existing, view, ownFeatures, ownSection, { numbered }) {
    // A document that is not 3.0 yet is migrated first, so nothing is written in an old shape
    const previous = existing ? read(existing) : null;
    const previousMetadata = (previous && previous.metadata) || {};
    const previousFeatures = (previous && previous.features) || [];
    const members = without(previous || {}, ['type', 'crs', 'metadata', 'features']);
    const { createdAt, views: previousViews } = previousMetadata;
    // `lastRef`: the counter of earlier writers, which no reader uses
    const others = without(previousMetadata, ['version', 'application', 'kind', 'createdAt', 'modifiedAt', 'views', 'lastRef']);
    const now = new Date().toISOString();

    const kept = previousFeatures.filter((/** @type {any} */ f) => ownerOf(f) !== view);
    /** @type {Record<string, any>} */
    const views = isObject(previousViews) ? { ...previousViews } : {};
    delete views[view];
    const section = (ownFeatures || []).length ? cleanSection(ownSection) : {};
    if (Object.keys(section).length) views[view] = section;

    let own = ownFeatures || [];
    let features = [...own, ...kept];
    /** @type {{ id: string, from: string, to: string }[]} */
    let renumbered = [];

    if (numbered) {
        // What the file holds: the ref of a feature the view loaded without one, and which features are new
        const saved = new Map(previousFeatures.map((/** @type {any} */ f, /** @type {number} */ i) => [idOf(f), { ref: refOf(f), index: i }]));
        own = own.map(feature => {
            const known = idOf(feature) ? saved.get(idOf(feature)) : undefined;
            return !refOf(feature) && known && known.ref ? withProperty(feature, 'ref', known.ref) : feature;
        });
        // A feature that is no annotation (a contour an older Hub numbered) loses its ref
        own = withoutStrayRefs(own).features;
        const ownSet = new Set(own);
        ({ features, changes: renumbered } = renumberTaken([...own, ...withoutStrayRefs(kept).features], f => ownSet.has(f) && !saved.has(idOf(f))));
        ({ features } = assignRefs(features, {
            fileOrder: (feature, index) => saved.get(idOf(feature))?.index ?? previousFeatures.length + index
        }));
    }

    /** @type {Record<string, string>} */
    const refs = {};
    features.slice(0, own.length).forEach(feature => {
        if (idOf(feature) && refOf(feature)) refs[idOf(feature)] = refOf(feature);
    });

    const document = withCrs({
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
        features
    });
    return { document, refs, renumbered };
}

/**
 * @param {any} feature @param {string} key @param {any} value
 * @returns {any} the feature with one more property
 */
const withProperty = (feature, key, value) => ({ ...feature, properties: { ...(isObject(feature.properties) ? feature.properties : {}), [key]: value } });

/**
 * A 3.0 document: the view's features and section replaced by the given ones, everything of the other
 * view (its features and its section) kept, `createdAt` kept, `modifiedAt` now. The features are written as
 * they are (an export of what a view shows, a copy of the file): see writeNumbered for a save.
 * @param {Record<string, any> | null | undefined} existing  the file as `read` gives it, null for a new one
 * @param {string} view  a VIEW
 * @param {any[]} ownFeatures  the view's features, all of them (the ones of the file are replaced)
 * @param {Record<string, any>} [ownSection]  what belongs to the view only (a view with no features has no section)
 * @returns {Record<string, any>}
 */
export function write(existing, view, ownFeatures, ownSection = {}) {
    return compose(existing, view, ownFeatures, ownSection, { numbered: false }).document;
}

/**
 * The document of a save: write, and the features without a `ref` get one, those of the other view too (the
 * first save of either view numbers the whole file, and changes nothing else in the features of the other view).
 *
 *  - a feature of the view without a `ref` that the file holds one for (by its `id`: another session numbered
 *    it) takes that one;
 *  - a feature of the view that was never saved (its `id` is not in the file) whose `ref` a feature in the file
 *    has, of either view (another save came first and issued it, or gave it to a feature this view loaded without
 *    one), takes the next ref, and is listed in `renumbered`;
 *  - a feature that is no annotation (a contour) has no ref: one it was given is taken away (withoutStrayRefs);
 *  - the annotations still without one get the next refs in creation order (annotationIds.assignRefs).
 * The view takes `refs` back into its own features (it has no refs where the file gave it new ones) and tells
 * the user about `renumbered`.
 * @param {Record<string, any> | null | undefined} existing  the file as the storage reads it now, null for a new one
 * @param {string} view  a VIEW
 * @param {any[]} ownFeatures
 * @param {Record<string, any>} [ownSection]
 * @returns {Written}
 */
export function writeNumbered(existing, view, ownFeatures, ownSection = {}) {
    return compose(existing, view, ownFeatures, ownSection, { numbered: true });
}

/**
 * The document that a numbering save writes: the file as it is with the `ref` every annotation lacks (and the
 * `id` of every feature, which a read gave them), without the ref of a feature that is no annotation, and without
 * the `lastRef` counter of earlier writers. The features keep their view and their order.
 * @param {Record<string, any>} document  the file as `read` gives it
 * @returns {{ document: Record<string, any>, numbered: boolean }}  `numbered`: whether the file changed (a file
 *   whose features all have both, that is 3.0 already and has no counter, needs no save)
 */
export function numberDocument(document) {
    const { features: annotated, removed } = withoutStrayRefs(document.features);
    const { features, assigned } = assignRefs(annotated);
    const metadata = isObject(document.metadata) ? document.metadata : {};
    const upToDate = !assigned && !removed && !('lastRef' in metadata) && versionOf(metadata.version)[0] >= MAX_MAJOR
        && document.features.every((/** @type {any} */ f) => idOf(f));
    const next = {
        ...document,
        metadata: { ...without(metadata, ['version', 'modifiedAt', 'lastRef']), version: FORMAT_VERSION, modifiedAt: new Date().toISOString() },
        features
    };
    return { document: upToDate ? document : next, numbered: !upToDate };
}

/**
 * The content of a file as a 3.0 document.
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
