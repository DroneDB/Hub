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
