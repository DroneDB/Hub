/**
 * Utility to convert Potree measurements to GeoJSON and vice versa
 */

/**
 * Convert a Potree measurement to a GeoJSON Feature
 * @param {Potree.Measure} measure - Potree measurement
 * @param {Object} coordinateSystem - Coordinate system from EPT
 * @returns {Object} GeoJSON Feature
 */
export function measureToGeoJSON(measure, coordinateSystem) {
    const points = measure.points.map(point => {
        // Convert local coordinates to geographic
        const coords = localToGeographic(point.position, coordinateSystem);
        return coords;
    });

    // Determine geometry type based on measurement type
    let geometry;
    let measurementType;

    if (measure.showArea && measure.closed) {
        // Polygon for areas
        measurementType = 'area';
        geometry = {
            type: 'Polygon',
            coordinates: [points.concat([points[0]])] // Close the polygon
        };
    } else if (measure.showHeight) {
        // LineString for heights (2 vertical points)
        measurementType = 'height';
        geometry = {
            type: 'LineString',
            coordinates: points
        };
    } else if (measure.showCircle) {
        // Point for circles
        measurementType = 'circle';
        geometry = {
            type: 'Point',
            coordinates: points[0]
        };
    } else if (measure.showAngles) {
        // Point for angles
        measurementType = 'angle';
        geometry = {
            type: 'Point',
            coordinates: points[1] // Center point
        };
    } else if (points.length === 1) {
        // Single point
        measurementType = 'point';
        geometry = {
            type: 'Point',
            coordinates: points[0]
        };
    } else {
        // LineString for distances
        measurementType = 'distance';
        geometry = {
            type: 'LineString',
            coordinates: points
        };
    }

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
        localCoordinates: measure.points.map(p => [p.position.x, p.position.y, p.position.z])
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
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {Potree.Measure} Potree measurement
 */
export function geoJSONToMeasure(feature, viewer, coordinateSystem) {
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
        coordinates = coordinates.map(coord =>
            geographicToLocal(coord, coordinateSystem)
        );
    }

    // Add points to measurement
    coordinates.forEach(coord => {
        const position = new THREE.Vector3(coord[0], coord[1], coord[2]);
        measure.addMarker({ position: position });
    });

    return measure;
}

/**
 * Export all viewer measurements in GeoJSON format
 * @param {Potree.Viewer} viewer - Potree viewer
 * @param {string} pointCloudPath - Point cloud path
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {Object} GeoJSON FeatureCollection
 */
export function exportMeasurements(viewer, pointCloudPath, coordinateSystem) {
    const measurements = viewer.scene.measurements || [];

    // Collect all features from measurements
    const features = measurements.map(m => measureToGeoJSON(m, coordinateSystem));

    // Also export annotations
    const annotations = [];
    viewer.scene.annotations.traverse(annotation => {
        annotations.push(annotation);
    });

    annotations.forEach(annotation => {
        const feature = annotationToGeoJSON(annotation, coordinateSystem);
        if (feature) {
            features.push(feature);
        }
    });

    const geojson = {
        type: 'FeatureCollection',
        crs: {
            type: 'name',
            properties: {
                name: 'EPSG:4326' // Output is always in WGS84
            }
        },
        metadata: {
            version: '1.0',
            pointCloudFile: pointCloudPath,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            application: 'Registry-Potree',
            coordinateSystem: coordinateSystem // Save original system for reference
        },
        features: features
    };

    return geojson;
}

/**
 * Convert an annotation to GeoJSON Feature
 * @param {Potree.Annotation} annotation - Potree annotation
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {Object|null} GeoJSON Feature or null if annotation is invalid
 */
function annotationToGeoJSON(annotation, coordinateSystem) {
    // Skip annotations without valid position
    if (!annotation || !annotation.position) {
        console.warn('Skipping annotation without valid position:', annotation?.title);
        return null;
    }

    const coords = localToGeographic(annotation.position, coordinateSystem);

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
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {Potree.Annotation} Potree annotation
 */
function geoJSONToAnnotation(feature, viewer, coordinateSystem) {
    const props = feature.properties;

    // Get position from local coordinates if available, otherwise convert from geographic
    let position;
    if (props.localCoordinates && props.localCoordinates.length >= 3) {
        position = props.localCoordinates;
    } else {
        position = geographicToLocal(feature.geometry.coordinates, coordinateSystem);
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

    geojson.features.forEach(feature => {
        try {
            const props = feature.properties;

            if (props.measurementType === 'annotation') {
                // Import as annotation
                const annotation = geoJSONToAnnotation(feature, viewer, coordinateSystem);
                viewer.scene.annotations.add(annotation);
                imported.push(annotation);
            } else {
                // Import as measurement
                const measure = geoJSONToMeasure(feature, viewer, coordinateSystem);
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
// Helper Functions for Coordinate Transformation
// ============================================================================

/**
 * Convert local coordinates to geographic
 * @param {THREE.Vector3} localCoords - Local coordinates
 * @param {Object} coordinateSystem - Coordinate system from EPT
 * @returns {Array} [lon, lat, alt]
 */
function localToGeographic(localCoords, coordinateSystem) {
    const { scale, offset, srs } = coordinateSystem;

    // Apply scale and offset
    const x = localCoords.x * scale[0] + offset[0];
    const y = localCoords.y * scale[1] + offset[1];
    const z = localCoords.z * scale[2] + offset[2];

    // Extract SRS definition (can be string EPSG code or object with wkt property)
    let srsDefinition = null;
    if (typeof srs === 'string') {
        srsDefinition = srs;
    } else if (srs && typeof srs === 'object') {
        // Handle nested structure like {"srs":{"wkt":"..."}}
        if (srs.srs && srs.srs.wkt) {
            srsDefinition = srs.srs.wkt;
        } else if (srs.wkt) {
            srsDefinition = srs.wkt;
        }
    }

    // If no SRS or already WGS84, return directly
    if (!srsDefinition) {
        return [x, y, z];
    }

    // Use proj4 to transform to WGS84 (proj4 handles both EPSG codes and WKT)
    if (typeof proj4 !== 'undefined') {
        try {
            const transformed = proj4(srsDefinition, 'EPSG:4326', [x, y]);
            return [transformed[0], transformed[1], z];
        } catch (e) {
            console.warn('Projection failed, using raw coordinates:', e);
            return [x, y, z];
        }
    }

    // Fallback if proj4 not available
    return [x, y, z];
}

/**
 * Convert geographic coordinates to local
 * @param {Array} geoCoords - [lon, lat, alt]
 * @param {Object} coordinateSystem - Coordinate system
 * @returns {Array} Local [x, y, z]
 */
function geographicToLocal(geoCoords, coordinateSystem) {
    const { scale, offset, srs } = coordinateSystem;
    let [x, y, z] = geoCoords;

    // Extract SRS definition (can be string EPSG code or object with wkt property)
    let srsDefinition = null;
    if (typeof srs === 'string') {
        srsDefinition = srs;
    } else if (srs && typeof srs === 'object') {
        // Handle nested structure like {"srs":{"wkt":"..."}}
        if (srs.srs && srs.srs.wkt) {
            srsDefinition = srs.srs.wkt;
        } else if (srs.wkt) {
            srsDefinition = srs.wkt;
        }
    }

    // Transform from WGS84 to local system if necessary
    if (srsDefinition && typeof proj4 !== 'undefined') {
        try {
            [x, y] = proj4('EPSG:4326', srsDefinition, [x, y]);
        } catch (e) {
            console.warn('Reverse projection failed:', e);
        }
    }

    // Remove offset and scale
    x = (x - offset[0]) / scale[0];
    y = (y - offset[1]) / scale[1];
    z = (z - offset[2]) / scale[2];

    return [x, y, z];
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
