// @ts-check
/**
 * Quick-share uploads (/share/*): a temporary dataset filled by an upload session.
 */
export default class ShareApi {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
    }

    /**
     * Starts a share session: the Registry creates the dataset `datasetName` in the organization `orgSlug` with
     * `visibility` (a `Visibility` value; the Hub sends Private unless the user chose another) and derives its
     * slug from the name. Without a field the Registry decides (`ddb share`, older clients).
     * A refused name or visibility rejects with the ApiError of a 400 whose `errors` names the field
     * (`errors.datasetName`).
     * @param {{ orgSlug?: string, datasetName?: string, visibility?: number }} [target]
     * @returns {Promise<{ token: string }>}
     */
    init({ orgSlug, datasetName, visibility } = {}) {
        const form = new FormData();
        if (orgSlug) form.append('OrgSlug', orgSlug);
        if (datasetName) form.append('DatasetName', datasetName);
        if (visibility !== undefined && visibility !== null) form.append('Visibility', String(visibility));
        return this.registry.postFormData('/share/init', form);
    }

    /** Absolute URL that receives the session's files. @param {string} token */
    uploadUrl(token) {
        return `${this.registry.url}/share/upload/${encodeURIComponent(token)}`;
    }

    /** Absolute URL that lists the files the session has received. @param {string} token */
    infoUrl(token) {
        return `${this.registry.url}/share/info/${encodeURIComponent(token)}`;
    }

    /** Ends the session. @param {string} token @returns {Promise<{ url: string }>} */
    commit(token) {
        return this.registry.makeRequest(`/share/commit/${encodeURIComponent(token)}`, 'POST');
    }

    /**
     * Discards the session: the Registry removes its files and the dataset the session created. The
     * step `cleanup` of the upload cancel on /upload.
     * @param {string} token
     */
    rollback(token) {
        return this.registry.makeRequest(`/share/rollback/${encodeURIComponent(token)}`, 'POST');
    }
}
