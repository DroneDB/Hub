/**
 * Utility to convert Potree measurements to GeoJSON and vice versa.
 *
 * The positions of a point cloud are in its own CRS already (the decoder applies the scale and offset
 * of the file), so a measurement's local coordinates are those of the CRS and its GeoJSON geometry is
 * that position reprojected to longitude and latitude (pointCloudGeometry). A cloud with no SRS that
 * proj4 can use has no geometry in WGS84: the geometry then holds the local coordinates, and the file
 * has no `crs` member (measurementFormat), so they are never labelled as WGS84.
 *
 * A saved file is placed in the CRS the cloud's COPC has now (measurementFormat's savedPositions), which
 * can differ from the one it was saved in. Lengths, areas and radii are in the unit of length of that
 * CRS (metres, feet or US survey feet), or in metres when its heights are in another unit than its x and y
 * (cloudUnitsOf), and `unit` names it. A circle is the one through its three points, as Potree draws it.
 *
 * What a feature carries besides what Potree draws (its `id`, `ref`, the fields of the annotation, its creation time and
 * every property the file has that the viewer does not know) is kept in the property bag of the measure or annotation
 * (`ddbProperties`), and written back: a save loses none of it, and the id of a feature is the one the file gave it, not
 * the session id Potree makes at each load.
 */

import { write, VIEW, savedPositions } from '@/libs/map/measurementFormat';
import { projectorFor, geometryOf, srsDefinitionOf } from '@/libs/map/pointCloudGeometry';
import { cloudUnitsOf, LINEAR_UNITS } from '@/libs/map/crsProjection';
import { pathLength, groundArea, circumradius, angleAt, SAME_UNITS } from '@/libs/map/scaledGeometry';
import { textToHtml, htmlToText } from '@/libs/sanitize';
import { newId } from '@/libs/ids';
import { ANNOTATION_KEYS, annotationProperties, unknownProperties } from '@/libs/map/annotationIds';

/** The property of a measure or an annotation that holds the identity, the fields and the unknown properties of its feature. */
export const PROPERTY_BAG = 'ddbProperties';

// What the viewer reads and writes itself; a feature may have more, which it keeps (unknownProperties)
const KNOWN_PROPERTIES = new Set([
    'measurementType', 'name', 'description', 'color', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity',
    'showDistances', 'showCoordinates', 'showArea', 'showAngles', 'showCircle', 'showHeight', 'showEdges', 'closed',
    'localCoordinates', 'groupId', 'area', 'perimeter', 'unit', 'distance', 'radius', 'circumference', 'angle', 'vertices',
    'createdAt', ...ANNOTATION_KEYS
]);

/**
 * The property bag of a feature that is loaded: its identity and fields, its creation time, and what is not the viewer's.
 * @param {Record<string, any>} props  the properties of the feature
 * @returns {Record<string, any>}
 */
export function propertyBagOf(props) {
    const bag = annotationProperties(props);
    if (typeof props.createdAt === 'string') bag.createdAt = props.createdAt;
    const extra = unknownProperties(props, KNOWN_PROPERTIES);
    if (Object.keys(extra).length) bag.extra = extra;
    return bag;
}

/**
 * The property bag of a measure or an annotation, with the `id` (and the creation time) a new one lacks. A measure
 * made in the viewer gets them when it is added; a feature of an old file that was read by something else than
 * measurementFormat gets an id here, once, so it keeps it.
 * @param {any} target  a Potree.Measure or Potree.Annotation
 * @returns {Record<string, any>}
 */
export function ensureProperties(target) {
    const bag = target[PROPERTY_BAG] || (target[PROPERTY_BAG] = { createdAt: new Date().toISOString() });
    if (!bag.id) bag.id = newId();
    return bag;
}

/** @param {number} value  to 2 decimals */
const rounded = value => parseFloat(value.toFixed(2));

/**
 * What the saved lengths of a cloud are in: the unit of its coordinates when x, y and z share one, else metres (each axis
 * scaled to metres first: a height in US survey feet and a distance in metres are not in one unit).
 * @param {string | null} srs
 * @returns {{ scale: ArrayLike<number>, unit: import('@/libs/map/crsProjection').LinearUnit }}
 */
function measurementFrame(srs) {
    const units = cloudUnitsOf(srs);
    return units.mixed ? { scale: units.metresPerAxis, unit: LINEAR_UNITS.METRE } : { scale: SAME_UNITS, unit: units.horizontal };
}

/**
 * The measures and the annotations of the viewer that a save writes.
 * @param {any} viewer  a Potree.Viewer
 * @returns {any[]}
 */
function savedObjects(viewer) {
    const objects = [...(viewer.scene.measurements || [])];
    viewer.scene.annotations.traverse((/** @type {any} */ annotation) => {
        if (annotation && annotation.position) objects.push(annotation);
    });
    return objects;
}

/**
 * The refs that the measures and annotations of the viewer have.
 * @param {any} viewer
 * @param {any} [except]  a measure or annotation to leave out (the one a dialog is editing)
 * @returns {string[]}
 */
export const viewerRefs = (viewer, except) => savedObjects(viewer)
    .filter(object => object !== except)
    .map(object => object[PROPERTY_BAG]?.ref)
    .filter(Boolean);

/**
 * Gives the measures and annotations the refs a save wrote for them (by id): the file numbered the ones that had no
 * ref, and gave a new one to those whose ref another session had taken.
 * @param {any} viewer
 * @param {Record<string, string>} refs  the ref of each feature of the view, by id
 */
export function applyRefs(viewer, refs) {
    savedObjects(viewer).forEach(object => {
        const bag = object[PROPERTY_BAG];
        if (bag && bag.id && refs[bag.id]) bag.ref = refs[bag.id];
    });
}

/**
 * Convert a Potree measurement to a GeoJSON Feature
 * @param {Potree.Measure} measure - Potree measurement
 * @param {import('@/libs/map/pointCloudGeometry').Projector} projector - the CRS of the point cloud
 * @param {{ scale: ArrayLike<number>, unit: import('@/libs/map/crsProjection').LinearUnit }} frame - what lengths are
 *   measured in (measurementFrame)
 * @returns {Object} GeoJSON Feature
 */
function measureToGeoJSON(measure, projector, { scale, unit }) {
    const points = measure.points.map(point => projector.toGeographic(point.position));

    // The kind of measurement, from what the measure shows
    let measurementType;
    if (measure.showArea && measure.closed) measurementType = 'area';
    else if (measure.showHeight) measurementType = 'height';
    else if (measure.showCircle) measurementType = 'circle';
    else if (measure.showAngles) measurementType = 'angle';
    else if (points.length === 1) measurementType = 'point';
    else measurementType = 'distance';

    const geometry = geometryOf(measurementType, points);

    // Build properties
    const properties = {
        measurementType: measurementType,
        name: htmlToText(measure.name),
        description: measure.description || '',
        color: '#' + measure.color.getHexString(),
        'stroke-width': measure.strokeWidth || 2,
        'stroke-opacity': measure.strokeOpacity ?? 1,
        fill: '#' + (measure.fillColor ? measure.fillColor.getHexString() : measure.color.getHexString()),
        'fill-opacity': measure.fillOpacity ?? 0.2,
        showDistances: measure.showDistances,
        showCoordinates: measure.showCoordinates,
        showArea: measure.showArea,
        showAngles: measure.showAngles,
        showCircle: measure.showCircle,
        showHeight: measure.showHeight,
        showEdges: measure.showEdges,
        closed: measure.closed,

        // Save local coordinates for easier re-import
        localCoordinates: measure.points.map(p => [p.position.x, p.position.y, p.position.z]),
        // Group assignment (optional)
        groupId: measure.groupId || null
    };

    // Add calculated values if available (2 decimals, in the unit of the frame)
    const positions = measure.points.map(p => p.position);
    if (measure.showArea && measure.closed) {
        properties.area = rounded(groundArea(positions, scale));
        properties.perimeter = rounded(pathLength([...positions, positions[0]], scale));
        properties.unit = `${unit.code}²`;
    }

    if (measurementType === 'distance' || measurementType === 'height') {
        properties.distance = rounded(pathLength(positions, scale));
        properties.unit = unit.code;
    }

    // Potree draws the circle through the three points of the measure
    if (measurementType === 'circle' && positions.length >= 3) {
        const radius = rounded(circumradius(positions[0], positions[1], positions[2], scale));
        properties.radius = radius;
        properties.circumference = 2 * Math.PI * radius;
        properties.area = Math.PI * radius * radius;
        properties.unit = unit.code;
    }

    if (measurementType === 'angle' && positions.length >= 3) {
        properties.angle = rounded(angleAt(positions[0], positions[1], positions[2], scale));
        properties.unit = 'degrees';
        properties.vertices = measure.points.map(p => [p.position.x, p.position.y, p.position.z]);
    }

    return featureOf(measure, geometry, properties);
}

/**
 * The GeoJSON feature of a measure or an annotation: its viewer properties under those of its bag, and its `id` as the
 * id of the feature.
 * @param {any} target
 * @param {Record<string, any>} geometry
 * @param {Record<string, any>} properties
 */
function featureOf(target, geometry, properties) {
    const { extra, createdAt, ...fields } = ensureProperties(target);
    return {
        type: 'Feature',
        id: fields.id,
        geometry,
        properties: { ...extra, ...properties, ...(createdAt ? { createdAt } : {}), ...fields }
    };
}

/**
 * Convert a GeoJSON Feature to a Potree measurement
 * @param {Object} feature - GeoJSON Feature
 * @param {number[][]} positions - its points in the CRS of the point cloud (savedPositions)
 * @returns {Potree.Measure} Potree measurement
 */
function geoJSONToMeasure(feature, positions) {
    const measure = new Potree.Measure();
    const props = feature.properties;

    // Restore base properties
    measure.name = textToHtml(props.name || 'Measure');
    measure.description = props.description || '';
    measure.showDistances = props.showDistances !== undefined ? props.showDistances : true;
    measure.showCoordinates = props.showCoordinates || false;
    measure.showArea = props.showArea || false;
    measure.showAngles = props.showAngles || false;
    measure.showCircle = props.showCircle || false;
    measure.showHeight = props.showHeight || false;
    measure.showEdges = props.showEdges !== undefined ? props.showEdges : true;
    measure.closed = props.closed !== undefined ? props.closed : true;

    // Restore color
    if (props.color) {
        measure.color = new THREE.Color(props.color);
    }

    // Restore group assignment
    if (props.groupId) {
        measure.groupId = props.groupId;
    }

    // Restore stroke and fill properties
    measure.strokeWidth = props['stroke-width'] || 2;
    measure.strokeOpacity = props['stroke-opacity'] ?? 1;
    measure.fillOpacity = props['fill-opacity'] ?? 0.2;
    if (props.fill) {
        measure.fillColor = new THREE.Color(props.fill);
    }

    // Add points to measurement
    positions.forEach(coord => {
        const position = new THREE.Vector3(coord[0], coord[1], coord[2]);
        measure.addMarker({ position: position });
    });

    // Its identity and fields, and the properties of the file that the viewer does not know
    measure[PROPERTY_BAG] = propertyBagOf(props);

    return measure;
}

/**
 * Export all viewer measurements in GeoJSON format: the document of the 3D viewer's measurements (its
 * features and its section of the file), which the storage merges into the file next to the 2D map's.
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {string} pointCloudPath - Point cloud path
 * @param {Object} coordinateSystem - Coordinate system of the point cloud ({ srs, scale, offset, bounds })
 * @returns {Object} GeoJSON FeatureCollection
 */
export function exportMeasurements(viewer, pointCloudPath, coordinateSystem) {
    const measurements = viewer.scene.measurements || [];
    const projector = projectorFor(coordinateSystem);
    const frame = measurementFrame(srsDefinitionOf(coordinateSystem));

    // Collect all features from measurements
    const features = measurements.map(m => measureToGeoJSON(m, projector, frame));

    // Also export annotations
    const annotations = [];
    viewer.scene.annotations.traverse(annotation => {
        annotations.push(annotation);
    });

    annotations.forEach(annotation => {
        const feature = annotationToGeoJSON(annotation, projector);
        if (feature) {
            features.push(feature);
        }
    });

    return write(null, VIEW.POINT_CLOUD, features, { pointCloudFile: pointCloudPath, coordinateSystem });
}

// Potree keeps the title and the description of an annotation, and the name of a measure, as HTML (it parses them into
// its labels, its panel and its scene tree, and the panel writes them back as HTML): the file holds them as plain text, so
// they are made HTML (escaped, a newline a <br>) on their way in and read back as text on their way out.

/**
 * Convert an annotation to GeoJSON Feature
 * @param {Potree.Annotation} annotation - Potree annotation
 * @param {import('@/libs/map/pointCloudGeometry').Projector} projector - the CRS of the point cloud
 * @returns {Object|null} GeoJSON Feature or null if annotation is invalid
 */
function annotationToGeoJSON(annotation, projector) {
    // Skip annotations without valid position
    if (!annotation || !annotation.position) {
        console.warn('Skipping annotation without valid position:', annotation?.title);
        return null;
    }

    const coords = projector.toGeographic(annotation.position);

    return featureOf(annotation, { type: 'Point', coordinates: coords }, {
        measurementType: 'annotation',
        name: htmlToText(annotation.title) || 'Annotation',
        description: htmlToText(annotation.description),
        localCoordinates: [annotation.position.x, annotation.position.y, annotation.position.z]
    });
}

/**
 * Convert a GeoJSON Feature to an annotation
 * @param {Object} feature - GeoJSON Feature
 * @param {number[][]} positions - its point in the CRS of the point cloud (savedPositions)
 * @returns {Potree.Annotation} Potree annotation
 */
function geoJSONToAnnotation(feature, positions) {
    const props = feature.properties;

    const annotation = new Potree.Annotation({
        position: positions[0],
        title: textToHtml(props.name || 'Annotation'),
        description: textToHtml(props.description)
    });
    annotation[PROPERTY_BAG] = propertyBagOf(props);

    return annotation;
}

/**
 * Import measurements from GeoJSON into the viewer
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {{ imported: any[], unplaced: number } | undefined}  what was added to the viewer, and how many saved
 *   features could not be placed in the cloud's CRS (left out: see savedPositions)
 */
export function importMeasurements(geojson, viewer, coordinateSystem) {
    if (!geojson || !geojson.features) {
        console.warn('Invalid GeoJSON data');
        return;
    }

    const imported = [];
    let unplaced = 0;
    // In the CRS of the COPC the viewer has now, which may not be the one the file was saved in
    const positionsOf = savedPositions(geojson, coordinateSystem);

    geojson.features.forEach(feature => {
        try {
            const props = feature.properties;
            const positions = positionsOf(feature);
            // In a CRS that cannot be converted to the cloud's: not shown where it is not
            if (!positions || !positions.length) {
                unplaced++;
                return;
            }

            if (props.measurementType === 'annotation') {
                // Import as annotation
                const annotation = geoJSONToAnnotation(feature, positions);
                viewer.scene.annotations.add(annotation);
                imported.push(annotation);
            } else {
                // Import as measurement
                const measure = geoJSONToMeasure(feature, positions);
                viewer.scene.addMeasurement(measure);
                imported.push(measure);
            }
        } catch (e) {
            console.error('Error importing measurement:', e, feature);
        }
    });

    console.log(`Imported ${imported.length} measurements/annotations`);
    return { imported, unplaced };
}
