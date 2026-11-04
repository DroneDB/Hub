// @ts-check
/**
 * Registry system endpoints (/sys/*) used by the Hub: configuration,
 * processing nodes, upload diagnostics. Pages call these instead of building paths.
 */
const EMAIL_TEMPLATES = '/sys/email/templates';
/** @param {string} name */
const emailTemplatePath = name => `${EMAIL_TEMPLATES}/${encodeURIComponent(name)}`;

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

    // ---- E-mail templates the admin can edit (admin) ----

    /** The editable templates: [{ name, title, isDefault }]. */
    emailTemplates() {
        return this.registry.getRequest(EMAIL_TEMPLATES, { cache: false });
    }

    /**
     * One template: its current and default subject and body, and the placeholders it accepts.
     * @param {string} name
     */
    emailTemplate(name) {
        return this.registry.getRequest(emailTemplatePath(name), { cache: false });
    }

    /**
     * Saves the text (the server checks the placeholders: 400 names the bad one); answers with the template.
     * @param {string} name @param {{ subject: string, body: string }} text
     */
    saveEmailTemplate(name, text) {
        return this.registry.makeRequest(emailTemplatePath(name), { method: 'PUT', body: text, invalidate: EMAIL_TEMPLATES });
    }

    /** Back to the built-in text; answers with the template. @param {string} name */
    resetEmailTemplate(name) {
        return this.registry.makeRequest(emailTemplatePath(name), { method: 'DELETE', invalidate: EMAIL_TEMPLATES });
    }

    /**
     * The e-mail an unsaved text gives with sample data: { subject, text, html }.
     * @param {string} name @param {{ subject: string, body: string }} text
     */
    previewEmailTemplate(name, text) {
        return this.registry.makeRequest(`${emailTemplatePath(name)}/preview`, { method: 'POST', body: text, readOnly: true });
    }

    /**
     * Sends the sample e-mail of an unsaved text to the signed-in admin (nothing is saved).
     * @param {string} name @param {{ subject: string, body: string }} text
     */
    testEmailTemplate(name, text) {
        return this.registry.makeRequest(`${emailTemplatePath(name)}/test`, { method: 'POST', body: text, readOnly: true });
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
     * Upload diagnostics: sends `body` to the probe endpoint and answers its status once the
     * whole answer is in (the caller reads the status: 429 means "try again later").
     * @param {BodyInit} body
     */
    uploadProbe(body) {
        return answered(this.registry.fetchRaw('/sys/upload-probe', { method: 'POST', body, cache: 'no-store' }));
    }

    /** One round trip to the server (latency measurement), answered once the whole answer is in. */
    ping() {
        return answered(this.registry.fetchRaw('/sys/version', { cache: 'no-store' }));
    }
}

/**
 * The status of a request whose body the caller does not need, once that body is read to its
 * end: a response whose body is never read stays open in the browser (the request never shows
 * as finished, and its connection is not free for the next one), and a measurement that stops
 * at the headers leaves out the rest of the answer.
 * @param {Promise<Response>} request
 * @returns {Promise<{ status: number, ok: boolean }>}
 */
async function answered(request) {
    const response = await request;
    await response.arrayBuffer();
    return { status: response.status, ok: response.ok };
}
