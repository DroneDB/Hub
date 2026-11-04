/**
 * importSources - Static metadata describing the available import sources and the
 * parameter fields each one needs. Field names MUST match the backend source params
 * (see RegistryImportSource / ArchiveUrlImportSource). Fields flagged `sensitive`
 * are encrypted server-side before being handed to the worker.
 */
export const IMPORT_SOURCES = [
    {
        type: 'registry',
        label: 'DroneDB Registry / Hub',
        icon: 'fa-solid fa-server',
        description: 'Import a dataset from another DroneDB Registry or Hub instance.',
        fields: [
            { name: 'url', label: 'Registry URL', type: 'text', placeholder: 'https://hub.dronedb.app', required: true },
            { name: 'organization', label: 'Organization', type: 'text', placeholder: 'organization slug', required: true },
            { name: 'dataset', label: 'Dataset', type: 'text', placeholder: 'dataset slug', required: true },
            { name: 'username', label: 'Username', type: 'text', placeholder: 'optional (for private datasets)', required: false },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'optional', required: false, sensitive: true }
        ]
    },
    {
        type: 'archive-url',
        label: 'Archive URL',
        icon: 'fa-solid fa-file-zipper',
        description: 'Download and extract a zip/tar/7z/rar archive from a URL.',
        fields: [
            { name: 'url', label: 'Archive URL', type: 'text', placeholder: 'https://example.com/data.zip', required: true },
            { name: 'username', label: 'Username', type: 'text', placeholder: 'optional (HTTP basic auth)', required: false },
            { name: 'password', label: 'Password', type: 'password', placeholder: 'optional', required: false, sensitive: true }
        ]
    }
];

/** Returns the source metadata for a given type, or null. */
export function getImportSource(type) {
    return IMPORT_SOURCES.find(s => s.type === type) || null;
}

// A host as typed without a scheme: a name with a dot or a port, or localhost.
const hostRe = /^(localhost|[^\s/:]+\.[^\s/:]+|[^\s/:]+:\d+)(:\d+)?$/i;

/**
 * Splits what a user pastes in the Registry URL field into the address of the Registry and the
 * organization and the dataset it names. Understands:
 *   - the link of a dataset page or of one of its viewers: https://hub.dronedb.app/r/odm/brighton-beach[/view/...]
 *   - the link of an organization page: https://hub.dronedb.app/r/odm (no dataset)
 *   - an API link: https://hub.dronedb.app/orgs/odm/ds/brighton-beach[/...]
 *   - a ddb tag, with or without a scheme: hub.dronedb.app/odm/brighton-beach
 * A path before /r/ or /orgs/ is kept (a Registry served below a prefix); a link without a scheme
 * is https. Returns null for any other text, the bare address of a Registry included.
 */
export function splitRegistryLink(text) {
    let raw = (text || '').trim();
    if (!raw) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        if (!hostRe.test(raw.split('/')[0])) return null;
        raw = `https://${raw}`;
    }

    let url;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    let segments;
    try {
        segments = url.pathname.split('/').filter(s => s.length > 0).map(decodeURIComponent);
    } catch {
        return null;
    }
    const base = prefix => (prefix.length ? `${url.origin}/${prefix.map(encodeURIComponent).join('/')}` : url.origin);

    const r = segments.indexOf('r');
    if (r >= 0 && r + 1 < segments.length)
        return { url: base(segments.slice(0, r)), organization: segments[r + 1], dataset: segments[r + 2] || '' };

    const orgs = segments.indexOf('orgs');
    if (orgs >= 0 && orgs + 1 < segments.length) {
        const dataset = segments[orgs + 2] === 'ds' ? segments[orgs + 3] || '' : '';
        return { url: base(segments.slice(0, orgs)), organization: segments[orgs + 1], dataset };
    }

    // A ddb tag: the server, then the organization and the dataset.
    if (segments.length === 2)
        return { url: url.origin, organization: segments[0], dataset: segments[1] };

    return null;
}
