// @ts-check

/**
 * The bytes of an image: the Registry's own endpoints (a thumbnail, a stored capture, the logo of a template) with the
 * session of the user, any other address as the browser fetches it.
 * @param {any} dataset
 * @param {string} url
 * @param {{ api: boolean, signal?: AbortSignal }} options
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(dataset, url, { api, signal }) {
    const response = api ? await dataset.registry.fetchRaw(url, { signal }) : await fetch(url, { signal });
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    return response.blob();
}
