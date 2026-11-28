/**
 * The type check of the Vue components (jsconfig.components.json: checkJs on, components only).
 * `npm run typecheck` checks the `.js` files marked `// @ts-check` and no component; this one
 * counts the diagnostics of the components against a baseline that only shrinks.
 * Shared by scripts/check_component_types.mjs and its spec.
 */

/**
 * The diagnostics of component files in the output of `vue-tsc --pretty false`.
 * @param {string} output
 * @returns {string[]} one line per diagnostic
 */
export const vueDiagnostics = output =>
    output.split('\n').filter(line => /^[^\s(][^(]*\.vue\(\d+,\d+\): error TS\d+:/.test(line));

/**
 * @param {number} count the diagnostics now
 * @param {number} baseline the diagnostics the baseline allows
 * @returns {{ ok: boolean, message: string }}
 */
export function compareWithBaseline(count, baseline) {
    if (count > baseline) return { ok: false, message: `${count - baseline} more type errors in components than the baseline (${count} > ${baseline}). Fix the new ones.` };
    if (count < baseline) return { ok: false, message: `${baseline - count} fewer type errors in components than the baseline (${count} < ${baseline}). Lower the baseline: node scripts/check_component_types.mjs --update` };
    return { ok: true, message: `${count} type errors in components, as the baseline allows` };
}
