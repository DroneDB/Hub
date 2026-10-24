/**
 * eslint-plugin-vuejs-accessibility's recommended rules, as errors, on every component.
 * No rule is switched off for any file, so a new finding fails the lint. A justified exception is an eslint-disable-next-line with
 * the reason (for example a mouse shortcut whose keyboard path is elsewhere).
 */
import vueA11y from 'eslint-plugin-vuejs-accessibility';

const recommended = vueA11y.configs['flat/recommended'].find(c => c.rules).rules;
const RULES = {
    ...Object.fromEntries(Object.keys(recommended).map(r => [r, 'error'])),
    // A label is associated by nesting OR by `for`/`id`; the default demands both
    'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }]
};

export function a11yConfigs() {
    return [
        { files: ['webapp/js/**/*.vue'], plugins: { 'vuejs-accessibility': vueA11y }, rules: RULES }
    ];
}
