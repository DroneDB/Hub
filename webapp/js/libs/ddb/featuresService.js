/**
 * Feature flags and server facts from /sys/features:
 * `reg.features`. Loading returns data only; the app applies the branding it carries.
 */
export default class FeaturesService {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
        /** @type {Record<string, any>} */
        this.values = {};
    }

    /** Loads the flags (the endpoint is anonymous). Failures leave an empty set. */
    async load() {
        try {
            this.values = (await this.registry.getRequest('/sys/features')) || {};
        } catch (e) {
            console.error('Failed to load features:', e);
            this.values = {};
        }
        return this.values;
    }

    /** Whether a boolean feature is on (false until loaded). @param {string} name */
    get(name) {
        return this.values[name] === true;
    }

    /** Raw value of a feature, or null. @param {string} name */
    value(name) {
        return this.values[name] ?? null;
    }

    clear() {
        this.values = {};
    }
}
