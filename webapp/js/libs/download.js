// @ts-check
/** Saving client-side data as a file (HQ-02). */

/**
 * Save a Blob under `filename` through a temporary link.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    try {
        a.click();
    } finally {
        a.remove();
        // Revoking at once can cancel the download in some browsers
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

/**
 * Save text (JSON, CSV, GeoJSON) as a file.
 * @param {string} text
 * @param {string} filename
 * @param {string} [type]
 */
export function downloadText(text, filename, type = 'text/plain') {
    downloadBlob(new Blob([text], { type }), filename);
}

/**
 * The file name in a Content-Disposition header, or `fallback`.
 * @param {string|null|undefined} header
 * @param {string} fallback
 */
export function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;
    const star = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (star) {
        try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ }
    }
    const plain = header.match(/filename=([^;]+)/i);
    return plain ? plain[1].trim().replace(/^"|"$/g, '') : fallback;
}
