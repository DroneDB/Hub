/**
 * A Vue template compiler transform, shared by webpack (vue-loader) and vitest: an icon of a
 * template, an empty <i> (<i class="fa-solid fa-map" />), is hidden from assistive technology
 * (aria-hidden="true"). Its glyph is drawn by the icon font, in the private use area: a screen
 * reader would read it as a stray character in the name of the tab, button or tile around it
 * (" Map"). An icon that says something itself keeps what it says: one with an aria-label,
 * aria-labelledby, a role, a title or its own aria-hidden is left as it is, and so is an <i>
 * with content (italic text) or with v-bind of a whole object (its attributes are not known here).
 */

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;
const TEXT = 2;

const NAMING = new Set(['aria-hidden', 'aria-label', 'aria-labelledby', 'role', 'title']);

function attributeName(prop) {
    if (prop.type === ATTRIBUTE) return prop.name;
    if (prop.type === DIRECTIVE && prop.name === 'bind') {
        // v-bind="object": any attribute may be in it
        if (!prop.arg) return '*';
        return prop.arg.isStatic ? prop.arg.content : '*';
    }
    return null;
}

/** @type {import('@vue/compiler-core').NodeTransform} */
function decorativeIcons(node) {
    if (node.type !== ELEMENT || node.tag !== 'i' || node.children.length) return;
    for (const prop of node.props) {
        const name = attributeName(prop);
        if (name === '*' || NAMING.has(name)) return;
    }
    node.props.push({
        type: ATTRIBUTE,
        name: 'aria-hidden',
        nameLoc: node.loc,
        value: { type: TEXT, content: 'true', loc: node.loc },
        loc: node.loc
    });
}

module.exports = { decorativeIcons };
