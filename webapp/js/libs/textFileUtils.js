/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ddb from 'ddb';
const { pathutils } = ddb;

// Extensions that should open as text by default
const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'json', 'geojson',
    'csv', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf',
    'log', 'properties', 'env', 'gitignore', 'dockerignore',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
    'sql', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'go', 'rs', 'rb', 'php',
    'wkt', 'prj'
];

// Binary extensions that should never be opened as text
const BINARY_EXTENSIONS = [
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'mp3', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'wav', 'ogg', 'flac',
    'las', 'laz', 'ply', 'obj', 'fbx', 'glb', 'gltf', 'dae', 'stl', '3ds',
    'shp', 'dbf', 'shx', 'gpkg', 'mbtiles', 'sqlite', 'db',
    'ddb', 'nxs', 'nxz'
];

// Maximum file size for text editing (5MB)
const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Get file extension from path
 */
function getExtension(path) {
    const base = pathutils.basename(path);
    const lastDot = base.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return base.substring(lastDot + 1).toLowerCase();
}

/**
 * Check if file should open as text by default (based on extension)
 */
function isDefaultTextFile(path) {
    const ext = getExtension(path);
    return TEXT_EXTENSIONS.includes(ext);
}

/**
 * Check if file is definitely binary (should never be opened as text)
 */
function isBinaryFile(path) {
    const ext = getExtension(path);
    return BINARY_EXTENSIONS.includes(ext);
}

/**
 * Check if file can potentially be opened as text
 * (not binary AND within size limit)
 */
function canOpenAsText(entry) {
    if (!entry || !entry.path) return false;

    // Check if binary
    if (isBinaryFile(entry.path)) return false;

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
        case 'html':
        case 'htm':
        case 'svg':
            return 'xml';
        default:
            return 'text';
    }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
            case 'json':
                const parsed = JSON.parse(content);
                return {
                    success: true,
                    content: JSON.stringify(parsed, null, 2)
                };
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
    TEXT_EXTENSIONS,
    BINARY_EXTENSIONS,
    MAX_TEXT_FILE_SIZE,
    getExtension,
    isDefaultTextFile,
    isBinaryFile,
    canOpenAsText,
    shouldOpenAsText,
    getLanguageMode,
    formatFileSize,
    canFormat,
    formatContent
};
