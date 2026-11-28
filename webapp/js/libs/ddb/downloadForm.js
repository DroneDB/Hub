/**
 * The form of a download that is too long for a URL: the browser posts it itself, so the answer (the ZIP) is
 * handled as a native download and is never read into memory by the page.
 */

// A GET URL from this length on goes to the Registry as a POST (proxies and servers refuse request lines of about 8 KB,
// and the browsers navigate far shorter ones less reliably)
export const MAX_DOWNLOAD_URL_LENGTH = 2000;

/**
 * The fields of a download request: one `path` per file (a name may contain a comma, so the paths are never joined),
 * and `inline=1` when asked.
 * @param {string[]} paths
 * @param {{ inline?: boolean }} [options]
 * @returns {FormData}
 */
export function downloadFormData(paths, options = {}) {
    const formData = new FormData();
    for (const path of paths) formData.append('path', path);
    if (options.inline) formData.append('inline', '1');
    return formData;
}

/**
 * Posts the download as a hidden `<form method="post">` of the page: the cookie of the session goes with it, and
 * the answer is an attachment, so the page stays where it is.
 * @param {string} action  absolute URL of the download endpoint
 * @param {string[]} paths
 * @param {{ inline?: boolean }} [options]
 */
export function submitDownloadForm(action, paths, options = {}) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = action;
    form.style.display = 'none';
    for (const [name, value] of downloadFormData(paths, options)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
    }
    document.body.appendChild(form);
    try {
        form.submit();
    } finally {
        form.remove();
    }
}
