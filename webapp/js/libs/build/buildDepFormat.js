/**
 * Shared formatting helper for build dependency names (companion/sidecar
 * files or external tools) that are blocking a build. Extracted into its own
 * leaf module (no other build/* imports) so both buildHelpers.js and
 * fileAvailabilityChecker.js can use it without a circular dependency.
 */
function formatMissingDeps(deps) {
    if (!deps || deps.length === 0) return 'unknown dependency';

    const describe = (dep) => (/[./\\]/.test(dep) ? `companion file "${dep}"` : `tool "${dep}"`);

    return deps.map(describe).join(', ');
}

export { formatMissingDeps };
