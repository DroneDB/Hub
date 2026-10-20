import ddb from 'ddb';

/**
 * CAD drawings (.dxf, .dwg) take a coordinate system through their same-name .prj (DDB-12):
 * Tools › Set Coordinate System writes it.
 */
export function isCadDrawing(entry) {
    return !!entry && entry.type === ddb.entry.type.VECTOR && /\.(dxf|dwg)$/i.test(entry.path || '');
}

/** What the server receives: "local", or the input with a bare number read as an EPSG code. */
export function crsRequest(mode, input) {
    if (mode === 'local') return 'local';
    const value = (input || '').trim();
    return /^\d+$/.test(value) ? `EPSG:${value}` : value;
}
