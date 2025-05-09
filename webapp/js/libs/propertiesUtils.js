/**
 * Utility functions for handling properties from geo features
 */

/**
 * Extracts the best display name from a feature's properties, checking various property names
 * and handling localization
 * @param {Object} properties - The properties object from a feature
 * @param {string} defaultValue - The default value to return if no suitable property is found
 * @returns {string} The best display name for the feature
 */
export function extractFeatureDisplayName(properties, defaultValue = 'Unknown feature') {
    if (!properties) return defaultValue;

    // Check for a name or label property in current language if available
    const userLang = navigator.language || navigator.userLanguage;
    const langPrefix = userLang.split('-')[0].toLowerCase();

    // First priority: localized name (name:en, name:it, etc.)
    if (properties[`name:${langPrefix}`]) {
        return properties[`name:${langPrefix}`];
    }
    // Second priority: generic name, label, title properties with case variations
    else if (properties.name) {
        return properties.name;
    } else if (properties.Name) {
        return properties.Name;
    } else if (properties.label) {
        return properties.label;
    } else if (properties.Label) {
        return properties.Label;
    } else if (properties.title) {
        return properties.title;
    } else if (properties.id) {
        return `ID: ${properties.id}`;
    }

    // Fallback to default
    return defaultValue;
}
