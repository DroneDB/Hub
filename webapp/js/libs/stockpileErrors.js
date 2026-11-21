/**
 * What the stockpile panel says when the server cannot detect or measure a pile.
 */

// Convert known technical/native error messages into something a user can act on.
export function friendlyStockpileError(raw, fallback) {
    if (!raw) return fallback;
    const msg = String(raw);
    if (/no stockpile/i.test(msg) || /cannot detect stockpile/i.test(msg)) {
        return 'No pile detected here. Try clicking closer to the top of a clearly elevated area, increase the search radius, or lower the sensitivity.';
    }
    if (/click point is outside/i.test(msg) || /outside raster bounds/i.test(msg)) {
        return 'The clicked point is outside the raster. Click within the dataset area.';
    }
    if (/no valid data/i.test(msg)) {
        return 'The selected area contains no elevation data. Try a different location.';
    }
    if (/cannot calculate volume/i.test(msg)) {
        return 'Cannot calculate volume for this area. Make sure the polygon falls inside the raster and contains valid elevation data.';
    }
    if (/radius must be positive/i.test(msg)) {
        return 'The search radius must be greater than zero.';
    }
    if (/at least two|at least 2|polyline with at least/i.test(msg)) {
        return 'A polygon with at least three vertices is required.';
    }
    return fallback;
}
