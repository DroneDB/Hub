// @ts-check
/**
 * Where a setting of the admin Configuration page goes in Registry's appsettings.json. The page
 * groups the settings by feature (GET /sys/config sections); the file has its own shape:
 *
 * - most keys are direct keys of AppSettings (the page only groups them, e.g. "Update check");
 * - some sections are an object of AppSettings with the section's name (AppSettings:Smtp ...);
 * - ConnectionStrings and Serilog are at the top of the file, next to AppSettings;
 * - a dotted key ("Uploads.MaxChunkBytes", "CacheProvider.Settings.InstanceAddress") is a path
 *   from AppSettings, whatever its section.
 */

/** The root key of the Registry settings */
export const APP_SETTINGS = 'AppSettings';

/** The sections whose fields are the keys of an object of AppSettings with the section's name */
const NESTED_SECTIONS = new Set([
    'DefaultAdmin', 'PasswordPolicy', 'LdapSettings', 'HubOptions', 'Smtp', 'BuildNotifications',
    'ProcessingPlatform', 'ProcessingBudget', 'HostBudget', 'Import'
]);

/**
 * The fields of the sections at the top of the file. Serilog's level is the value of its level
 * switch, and the log file is the path of its second sink (the file sink, after the console).
 * @type {Readonly<Record<string, (key: string) => (string|number)[]>>}
 */
const TOP_LEVEL_SECTIONS = Object.freeze({
    ConnectionStrings: key => ['ConnectionStrings', key],
    Serilog: key => {
        if (key === 'MinimumLevel') return ['Serilog', 'LevelSwitches', '$controlSwitch'];
        if (key === 'LogPath') return ['Serilog', 'WriteTo', 1, 'Args', 'path'];
        return ['Serilog', key];
    }
});

/**
 * The path of a setting in appsettings.json.
 * @param {string} section  the section name of GET /sys/config
 * @param {string} key      the field key
 * @returns {(string|number)[]}
 */
export function settingPath(section, key) {
    const topLevel = TOP_LEVEL_SECTIONS[section];
    if (topLevel) return topLevel(key);
    const parts = key.split('.');
    if (parts.length > 1 || !NESTED_SECTIONS.has(section)) return [APP_SETTINGS, ...parts];
    return [APP_SETTINGS, section, key];
}

/**
 * Sets a value at a path of a JSON object, making the objects (or, for a number, the arrays) on
 * the way. The array before a sink index gets the sinks before it by name, as the file has them.
 * @param {Record<string, any>} root
 * @param {(string|number)[]} path
 * @param {unknown} value
 */
export function setSettingAt(root, path, value) {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (node[key] === undefined) node[key] = typeof path[i + 1] === 'number' ? [] : {};
        node = node[key];
    }
    node[path[path.length - 1]] = value;
    fillSinks(root);
}

// The sinks of the default file, in order: an index in Serilog:WriteTo names its sink
const DEFAULT_SINKS = ['Console', 'File'];

function fillSinks(root) {
    const sinks = root.Serilog?.WriteTo;
    if (!Array.isArray(sinks)) return;
    for (let i = 0; i < sinks.length; i++) {
        sinks[i] = { Name: DEFAULT_SINKS[i], ...(sinks[i] || {}) };
    }
}

/** What a sensitive setting that is set shows in a copy of the whole file: the admin fills it in before use */
export const PLACEHOLDER = '<CHANGE-ME>';

/**
 * The name of a setting as .NET writes it ("AppSettings:Smtp:Password").
 * @param {(string|number)[]} path
 */
export function settingName(path) {
    return path.join(':');
}

/**
 * @typedef {object} AppSettingsCopy
 * @property {string} json  the document, indented
 * @property {number} count  the settings in it
 * @property {string[]} placeholders  the settings that hold PLACEHOLDER, which the admin fills in ('full' mode only)
 */

/**
 * The text to put in appsettings.json from the sections of GET /sys/config and the fields the admin edited (D-005).
 *
 *   'changes'  only the edited fields: the admin merges them into the file they have. A secret that was not typed
 *              again is not a change.
 *   'full'     every setting the server runs with, to start a file from. A secret that is set (the server never
 *              sends it) is PLACEHOLDER, listed in `placeholders`.
 *
 * @param {{ sections: any[], modified: Record<string, any>, mode: 'changes' | 'full' }} options
 *   modified  the edited values by "sectionIndex-fieldIndex"
 * @returns {AppSettingsCopy}
 */
export function buildAppSettings({ sections, modified, mode }) {
    /** @type {Record<string, any>} */
    const root = {};
    let count = 0;
    /** @type {string[]} */
    const placeholders = [];

    sections.forEach((section, sIdx) => section.fields.forEach((/** @type {any} */ field, /** @type {number} */ fIdx) => {
        if (field.fieldType === 'info') return;
        const key = `${sIdx}-${fIdx}`;
        const isModified = key in modified;
        if (mode === 'changes' && !isModified) return;

        // The value to use
        let rawValue;
        let placeholder = false;
        if (field.sensitive) {
            if (isModified && modified[key] !== '') {
                rawValue = modified[key];
            } else if (mode === 'full' && field.isSet) {
                rawValue = PLACEHOLDER;
                placeholder = true;
            } else {
                return; // not set, or not typed again: nothing to write
            }
        } else if (isModified) {
            rawValue = modified[key];
        } else {
            rawValue = field.currentValue;
        }

        const value = typedValue(field, rawValue);

        // A JSON field with no value (null) that was not edited has nothing to write: a null would replace the default
        // the server runs with, which is not null
        if (field.fieldType === 'json' && !isModified && value === null) return;

        // Skip null/empty values that match defaults; an unedited empty cron is the default of its job
        if (value === null || value === '') {
            if (!field.sensitive && (field.defaultValue === rawValue || (field.fieldType === 'cron' && !isModified))) return;
        }

        const path = settingPath(section.name, field.key);
        setSettingAt(root, path, value);
        count++;
        if (placeholder) placeholders.push(settingName(path));
    }));

    return { json: JSON.stringify(root, null, 2), count, placeholders };
}

/**
 * The value of a field in the type appsettings.json holds it in.
 * @param {{ fieldType: string }} field
 * @param {any} rawValue
 */
function typedValue(field, rawValue) {
    switch (field.fieldType) {
        case 'number':
            return rawValue === null || rawValue === '' ? null : Number(rawValue);
        case 'bool':
            return rawValue === 'True' || rawValue === true;
        case 'array':
            return Array.isArray(rawValue) ? rawValue
                : (typeof rawValue === 'string' ? rawValue.split(',').map(s => s.trim()).filter(Boolean) : []);
        case 'json':
            // Parse the JSON text into an object so it serializes as structured JSON
            try {
                return typeof rawValue === 'string' && rawValue.trim() ? JSON.parse(rawValue) : null;
            } catch {
                return rawValue; // keep raw (invalid) text visible for the admin to fix
            }
        case 'timespan':
            return rawValue || null;
        default:
            return rawValue;
    }
}
