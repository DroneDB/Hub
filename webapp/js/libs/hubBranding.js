/**
 * Hub branding and customization options.
 *
 * The values are sourced from the backend `/sys/features` endpoint
 * (see `FeaturesDto.HubOptions` server-side) and surfaced as the
 * frozen global `window.HubOptions` for legacy components that
 * already read it directly.
 *
 * This module also injects favicon / manifest / theme-color tags
 * into <head> based on the optional `Favicon` block, so neither
 * `index.html` nor user-customized files need to hold any branding state.
 */

const FAVICON_LINK_REL_DATA_KEY = 'hubBrandingInjected';

/**
 * Empty defaults — every getter consumer in the codebase already handles
 * `=== undefined` fallbacks, so we deliberately avoid populating values
 * we don't have.
 */
const EMPTY_OPTIONS = Object.freeze({});

/**
 * Installs `window.HubOptions` from the features payload returned by
 * `loadFeatures()` and applies the branding side-effects (title, favicons).
 *
 * Idempotent: calling it twice replaces the previously-injected tags.
 *
 * @param {object|null|undefined} hubOptions The `hubOptions` block from /sys/features.
 */
export function applyHubBranding(hubOptions) {
    const opts = hubOptions || EMPTY_OPTIONS;

    // Replace any prior frozen object (initial bootstrap may have a stub).
    try {
        Object.defineProperty(window, 'HubOptions', {
            value: Object.freeze({ ...opts }),
            writable: false,
            configurable: true
        });
    } catch (e) {
        // Fallback if the property is non-configurable for some reason.
        window.HubOptions = Object.freeze({ ...opts });
    }

    applyDocumentTitle(opts.appName);
    applyFavicon(opts.favicon);
}

function applyDocumentTitle(appName) {
    if (typeof appName === 'string' && appName.length > 0) {
        document.title = appName;
    }
}

function applyFavicon(favicon) {
    // Remove tags previously injected by us so reapplying is idempotent.
    document
        .querySelectorAll(`[data-${FAVICON_LINK_REL_DATA_KEY}="1"]`)
        .forEach(node => node.parentNode && node.parentNode.removeChild(node));

    if (!favicon) return;

    const head = document.head;
    if (!head) return;

    const links = [
        { rel: 'icon', href: favicon.faviconIco, attrs: { sizes: 'any' } },
        { rel: 'icon', href: favicon.favicon32, attrs: { type: 'image/png', sizes: '32x32' } },
        { rel: 'icon', href: favicon.favicon16, attrs: { type: 'image/png', sizes: '16x16' } },
        { rel: 'apple-touch-icon', href: favicon.appleTouchIcon, attrs: { sizes: '180x180' } },
        { rel: 'manifest', href: favicon.manifest, attrs: {} }
    ];

    for (const def of links) {
        if (!def.href) continue;
        const link = document.createElement('link');
        link.rel = def.rel;
        link.href = def.href;
        for (const [k, v] of Object.entries(def.attrs)) link.setAttribute(k, v);
        link.dataset[FAVICON_LINK_REL_DATA_KEY] = '1';
        head.appendChild(link);
    }

    if (favicon.themeColor) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = favicon.themeColor;
        meta.dataset[FAVICON_LINK_REL_DATA_KEY] = '1';
        head.appendChild(meta);
    }
}
