// @ts-check
/**
 * Quick-share uploads (/share/*): a temporary dataset filled by an upload session
 * (HQ-05; Upload.vue built these paths itself).
 */
export default class ShareApi {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
    }

    /** Starts a share session. @returns {Promise<{ token: string }>} */
    init() {
        return this.registry.makeRequest('/share/init', 'POST');
    }

    /** Absolute URL that receives the session's files. @param {string} token */
    uploadUrl(token) {
        return `${this.registry.url}/share/upload/${encodeURIComponent(token)}`;
    }

    /** Ends the session. @param {string} token @returns {Promise<{ url: string }>} */
    commit(token) {
        return this.registry.makeRequest(`/share/commit/${encodeURIComponent(token)}`, 'POST');
    }
}
