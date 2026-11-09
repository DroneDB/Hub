/**
 * Utility to convert Potree measurements to GeoJSON and vice versa.
 *
 * The positions of a point cloud are in its own CRS already (the decoder applies the scale and offset
 * of the file), so a measurement's local coordinates are those of the CRS and its GeoJSON geometry is
 * that position reprojected to longitude and latitude (pointCloudGeometry). A cloud with no SRS that
 * proj4 can use has no geometry in WGS84: the geometry then holds the local coordinates, and the file
 * has no `crs` member (measurementFormat), so they are never labelled as WGS84.
 */

import { write, VIEW } from '@/libs/map/measurementFormat';
import { projectorFor, geometryOf } from '@/libs/map/pointCloudGeometry';

/**
 * Convert a Potree measurement to a GeoJSON Feature
 * @param {Potree.Measure} measure - Potree measurement
 * @param {import('@/libs/map/pointCloudGeometry').Projector} projector - the CRS of the point cloud
 * @returns {Object} GeoJSON Feature
 */
function measureToGeoJSON(measure, projector) {
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
        name: measure.name,
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

    // Add calculated values if available
    if (measure.showArea && measure.closed) {
        properties.area = calculateArea(measure.points);
        properties.perimeter = calculatePerimeter(measure.points);
        properties.unit = 'm²';
    }

    if (measurementType === 'distance' || measurementType === 'height') {
        properties.distance = calculateDistance(measure.points);
        properties.unit = 'm';
    }

    if (measurementType === 'circle') {
        const radius = calculateCircleRadius(measure.points);
        properties.radius = radius;
        properties.circumference = 2 * Math.PI * radius;
        properties.area = Math.PI * radius * radius;
        properties.unit = 'm';
    }

    if (measurementType === 'angle' && measure.points.length >= 3) {
        properties.angle = calculateAngle(measure.points);
        properties.unit = 'degrees';
        properties.vertices = measure.points.map(p => [p.position.x, p.position.y, p.position.z]);
    }

    return {
        type: 'Feature',
        id: measure.uuid || measure.name,
        geometry: geometry,
        properties: properties
    };
}

/**
 * Convert a GeoJSON Feature to a Potree measurement
 * @param {Object} feature - GeoJSON Feature
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {import('@/libs/map/pointCloudGeometry').Projector} projector - the CRS of the point cloud
 * @returns {Potree.Measure} Potree measurement
 */
function geoJSONToMeasure(feature, viewer, projector) {
    const measure = new Potree.Measure();
    const props = feature.properties;

    // Restore base properties
    measure.name = props.name || 'Measure';
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

    // Convert coordinates to points
    let coordinates;

    if (feature.geometry.type === 'Point') {
        coordinates = [feature.geometry.coordinates];
    } else if (feature.geometry.type === 'LineString') {
        coordinates = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'Polygon') {
        // Remove the last point (duplicate for closure)
        coordinates = feature.geometry.coordinates[0].slice(0, -1);
    }

    // If we have saved local coordinates, use them (more accurate)
    if (props.localCoordinates && props.localCoordinates.length > 0) {
        coordinates = props.localCoordinates;
    } else {
        // Otherwise convert from geographic to local
        coordinates = coordinates.map(coord => projector.toLocal(coord));
    }

    // Add points to measurement
    coordinates.forEach(coord => {
        const position = new THREE.Vector3(coord[0], coord[1], coord[2]);
        measure.addMarker({ position: position });
    });

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

    // Collect all features from measurements
    const features = measurements.map(m => measureToGeoJSON(m, projector));

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

    return {
        type: 'Feature',
        id: annotation.uuid || annotation.title,
        geometry: {
            type: 'Point',
            coordinates: coords
        },
        properties: {
            measurementType: 'annotation',
            name: annotation.title || 'Annotation',
            description: annotation.description || '',
            localCoordinates: [annotation.position.x, annotation.position.y, annotation.position.z]
        }
    };
}

/**
 * Convert a GeoJSON Feature to an annotation
 * @param {Object} feature - GeoJSON Feature
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {import('@/libs/map/pointCloudGeometry').Projector} projector - the CRS of the point cloud
 * @returns {Potree.Annotation} Potree annotation
 */
function geoJSONToAnnotation(feature, viewer, projector) {
    const props = feature.properties;

    // Get position from local coordinates if available, otherwise convert from geographic
    let position;
    if (props.localCoordinates && props.localCoordinates.length >= 3) {
        position = props.localCoordinates;
    } else {
        position = projector.toLocal(feature.geometry.coordinates);
    }

    const annotation = new Potree.Annotation({
        position: position,
        title: props.name || 'Annotation',
        description: props.description || ''
    });

    return annotation;
}

/**
 * Import measurements from GeoJSON into the viewer
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {Object} coordinateSystem - Coordinate system
 */
export function importMeasurements(geojson, viewer, coordinateSystem) {
    if (!geojson || !geojson.features) {
        console.warn('Invalid GeoJSON data');
        return;
    }

    const imported = [];
    const projector = projectorFor(coordinateSystem);

    geojson.features.forEach(feature => {
        try {
            const props = feature.properties;

            if (props.measurementType === 'annotation') {
                // Import as annotation
                const annotation = geoJSONToAnnotation(feature, viewer, projector);
                viewer.scene.annotations.add(annotation);
                imported.push(annotation);
            } else {
                // Import as measurement
                const measure = geoJSONToMeasure(feature, viewer, projector);
                viewer.scene.addMeasurement(measure);
                imported.push(measure);
            }
        } catch (e) {
            console.error('Error importing measurement:', e, feature);
        }
    });

    console.log(`Imported ${imported.length} measurements/annotations`);
    return imported;
}

// ============================================================================
// Helper Functions for Geometric Calculations
// ============================================================================

function calculateDistance(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i].position;
        const p2 = points[i + 1].position;
        total += p1.distanceTo(p2);
    }
    return parseFloat(total.toFixed(2));
}

function calculateArea(points) {
    // Use Shoelace formula to calculate 2D area
    // For 3D, project onto plane
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const p1 = points[i].position;
        const p2 = points[(i + 1) % n].position;
        area += p1.x * p2.y - p2.x * p1.y;
    }

    return parseFloat(Math.abs(area / 2).toFixed(2));
}

function calculatePerimeter(points) {
    return calculateDistance(points.concat([points[0]]));
}

function calculateCircleRadius(points) {
    if (points.length < 2) return 0;
    const center = points[0].position;
    const edge = points[1].position;
    return parseFloat(center.distanceTo(edge).toFixed(2));
}

function calculateAngle(points) {
    if (points.length < 3) return 0;

    const p1 = points[0].position;
    const vertex = points[1].position;
    const p2 = points[2].position;

    const v1 = new THREE.Vector3().subVectors(p1, vertex);
    const v2 = new THREE.Vector3().subVectors(p2, vertex);

    const angle = v1.angleTo(v2) * (180 / Math.PI);
    return parseFloat(angle.toFixed(2));
}
