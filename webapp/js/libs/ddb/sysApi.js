// @ts-check
/**
 * Registry system endpoints (/sys/*) used by the Hub: configuration,
 * processing nodes, upload diagnostics. Pages call these instead of building paths.
 */
export default class SysApi {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
    }

    /** Effective configuration, by section (admin). */
    config() {
        return this.registry.getRequest('/sys/config');
    }

    /** Update-check state: installed and latest version, release notes, usage declaration (admin). */
    updateInfo() {
        return this.registry.getRequest('/sys/update-info');
    }

    /**
     * Save the usage declaration and contact e-mail (admin); answers with the fresh update info.
     * @param {{ useDeclaration: string|null, contactEmail: string|null, contactConsent: boolean }} settings
     */
    saveUpdateCheckSettings(settings) {
        return this.registry.putRequest('/sys/update-check/settings', settings);
    }

    /** Configured processing nodes (NodeODX). */
    processingNodes() {
        return this.registry.getRequest('/sys/processingNodes');
    }

    /** @param {string|number} nodeId */
    processingNodeOptions(nodeId) {
        return this.registry.getRequest(`/sys/processingNodes/${encodeURIComponent(nodeId)}/options`);
    }

    /** @param {string|number} nodeId */
    processingNodeStatus(nodeId) {
        return this.registry.getRequest(`/sys/processingNodes/${encodeURIComponent(nodeId)}/status`);
    }

    /**
     * Upload diagnostics: sends `body` to the probe endpoint and returns the raw Response
     * (the caller reads the status: 429 means "try again later").
     * @param {BodyInit} body
     */
    uploadProbe(body) {
        return this.registry.fetchRaw('/sys/upload-probe', { method: 'POST', body, cache: 'no-store' });
    }

    /** One round trip to the server (latency measurement). */
    ping() {
        return this.registry.fetchRaw('/sys/version', { cache: 'no-store' });
    }
}
