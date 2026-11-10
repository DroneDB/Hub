import ddb from 'ddb';

/**
 * CAD drawings (.dxf, .dwg) take a coordinate system through their same-name .prj:
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

// The words a WKT definition starts with (WKT 1 and WKT 2): the form of a value that is not an EPSG code
const WKT_START = /^(PROJCS|GEOGCS|PROJCRS|GEOGCRS|COMPD_CS|COMPOUNDCRS|COMPD)\b/i;

/**
 * What is wrong with the form of the coordinate system the dialog would send (FR-PRC-31), or null:
 * it checks `crsRequest(mode, input)`, so a bare number is valid (an EPSG code), "EPSG:<digits>"
 * is valid, and so is a text that starts with PROJCS, GEOGCS, PROJCRS, GEOGCRS or COMPD. Whether
 * the code exists, or the WKT is sound, is the server's to say (a 400, shown under the same field).
 * @param {string} request  the output of crsRequest('system', input)
 * @returns {string|null}
 */
export function crsProblem(request) {
    const value = (request || '').trim();
    if (value === '') return 'Enter a coordinate system.';
    if (/^EPSG:\d+$/i.test(value) || WKT_START.test(value)) return null;
    return 'Enter an EPSG code (such as 32632 or EPSG:32632) or a WKT definition (starting with PROJCS or GEOGCS).';
}
