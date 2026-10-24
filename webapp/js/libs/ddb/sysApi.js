// @ts-check
/**
 * Registry system endpoints (/sys/*) used by the Hub (HQ-05): configuration,
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
