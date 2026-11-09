import ddb from 'ddb';
const { pathutils } = ddb;

// Extensions that should open as text by default
const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'json',
    'csv', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf',
    'log', 'properties', 'env', 'gitignore', 'dockerignore',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
    'sql', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'go', 'rs', 'rb', 'php',
    'wkt', 'prj'
];

// Text formats that open in their viewer by default but can also be edited as text:
// vector and model formats stored as text, and the text sidecars of drone and GIS files
// (subtitles of a drone video, world files, VRT, XMP, QGIS/SLD styles...), ASCII point
// clouds and grids (XYZ, PTS, Esri ASCII grid), CZML and TOML
const EDITABLE_TEXT_EXTENSIONS = [
    'geojson', 'topojson', 'kml', 'gpx', 'gml', 'svg', 'dxf', 'obj', 'mtl',
    'srt', 'tfw', 'jgw', 'pgw', 'wld', 'vrt', 'xmp', 'cpg', 'qml', 'sld', 'tsv',
    'xyz', 'asc', 'pts', 'czml', 'toml'
];

// Every extension the text editor may open: an allow-list, by extension only (an entry type
// such as VECTOR covers binary formats too: KMZ, FlatGeobuf, GeoPackage, Shapefile, DWG)
const OPENABLE_TEXT_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...EDITABLE_TEXT_EXTENSIONS]);

// Maximum file size for text editing (5MB)
const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Get file extension from path
 */
function getExtension(path) {
    return pathutils.extname(path).slice(1);
}

/**
 * Check if file should open as text by default (based on extension)
 */
function isDefaultTextFile(path) {
    const ext = getExtension(path);
    return TEXT_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a PDF
 */
function isPdfFile(entry) {
    if (!entry || !entry.path) return false;
    return getExtension(entry.path) === 'pdf';
}

/**
 * Check if file can potentially be opened as text
 * (a known text extension AND within size limit; files without an extension cannot)
 */
function canOpenAsText(entry) {
    if (!entry || !entry.path) return false;

    // Only known text formats
    if (!OPENABLE_TEXT_EXTENSIONS.has(getExtension(entry.path))) return false;

    // Check size limit
    if (entry.size && entry.size > MAX_TEXT_FILE_SIZE) return false;

    return true;
}

/**
 * Check if file should automatically open in text editor
 */
function shouldOpenAsText(entry) {
    if (!canOpenAsText(entry)) return false;
    return isDefaultTextFile(entry.path);
}

// How much of the loaded content is looked at for a NUL character
const BINARY_SNIFF_LENGTH = 8192;

/**
 * Check if loaded file content is not text: a NUL character near the start, or the
 * header of a ZIP archive (KMZ, 3TZ and the like are ZIPs)
 * @param {unknown} content
 */
function looksBinary(content) {
    if (typeof content !== 'string') return false;
    return content.startsWith('PK\u0003\u0004') || content.slice(0, BINARY_SNIFF_LENGTH).includes('\u0000');
}

/**
 * Get syntax highlighting mode based on file extension
 */
function getLanguageMode(path) {
    const ext = getExtension(path);

    switch (ext) {
        case 'json':
        case 'geojson':
            return 'json';
        case 'md':
        case 'markdown':
            return 'markdown';
        case 'xml':
        case 'gpx':
        case 'kml':
        case 'html':
        case 'htm':
        case 'svg':
            return 'xml';
        default:
            return 'text';
    }
}

/**
 * Check if file format supports auto-formatting
 */
function canFormat(path) {
    const mode = getLanguageMode(path);
    return mode === 'json';
}

/**
 * Format content based on language mode
 * @param {string} content - The content to format
 * @param {string} mode - The language mode ('json', 'xml', etc.)
 * @returns {{ success: boolean, content: string, error?: string }}
 */
function formatContent(content, mode) {
    try {
        switch (mode) {
            case 'json': {
                const parsed = JSON.parse(content);
                return {
                    success: true,
                    content: JSON.stringify(parsed, null, 2)
                };
            }
            default:
                return {
                    success: false,
                    content: content,
                    error: 'Formatting not supported for this file type'
                };
        }
    } catch (e) {
        return {
            success: false,
            content: content,
            error: e.message
        };
    }
}

export {
    MAX_TEXT_FILE_SIZE,
    isPdfFile,
    canOpenAsText,
    shouldOpenAsText,
    looksBinary,
    getLanguageMode,
    canFormat,
    formatContent
};
