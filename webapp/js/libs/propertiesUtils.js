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

    // 1. Localized name (name:en, name:it, etc.)
    if (properties[`name:${langPrefix}`]) {
        return properties[`name:${langPrefix}`];
    }

    // 2. Generic name/label/title
    if (properties.name) return properties.name;
    if (properties.Name) return properties.Name;
    if (properties.label) return properties.label;
    if (properties.Label) return properties.Label;
    if (properties.title) return properties.title;

    // 3. Special display or tooltip properties
    if (properties.displayValue) return properties.displayValue;
    if (properties.tooltipText) return properties.tooltipText;

    // 4. ID as a last resort
    if (properties.id) return `ID: ${properties.id}`;

    // Fallback to default
    return defaultValue;
}
