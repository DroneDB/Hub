/**
 * Local rule: a comment or a test title says why in words. It does not cite an id of a planning document
 * (a requirement, decision, acceptance or work item id such as FR-XXX-NN, D-NNN, AC-NNN, U-NNN or a short
 * area code such as ORG-NN) or the path of one: those documents are not part of this repository, so the
 * reference tells a reader nothing.
 */

/** The id families of the planning documents (and `§` section marks, which cite a section of one). */
const AREAS = 'ADM|ACC|ORG|MAP|EXP|XC|UPL|RAS|PRC|VWR|NAV|SHR';
export const PLANNING_ID = new RegExp(
    `(?<![\\w-])(?:FR-[A-Z]+-\\d+|NFR-\\d+|AC-\\d{3}|D-\\d{3}|U-?\\d{3}|(?:${AREAS})-\\d{2})(?![\\w-])`
    + '|§\\s?\\d+(?:\\.\\d+)*|\\b(?:DroneDB-Roadmap|TBD|WORKING)/');

const TEST_FUNCTIONS = new Set(['describe', 'it', 'test', 'suite']);

/** The name of the test function a call is to: `it`, `it.skip`, `test.only` ... or null. */
function testFunctionOf(callee) {
    if (callee.type === 'Identifier') return TEST_FUNCTIONS.has(callee.name) ? callee.name : null;
    if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed) {
        return TEST_FUNCTIONS.has(callee.object.name) ? callee.object.name : null;
    }
    return null;
}

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Comments and test titles do not cite ids of planning documents' },
        schema: [],
        messages: {
            planningId: 'Do not cite the id "{{id}}" of a planning document in {{where}}: say why in words.'
        }
    },
    create(context) {
        const sourceCode = context.sourceCode;
        const check = (node, text, where) => {
            const match = PLANNING_ID.exec(text);
            if (match) context.report({ node, loc: node.loc, messageId: 'planningId', data: { id: match[0], where } });
        };
        return {
            Program() {
                // Script comments, then the comments of a component's template (not part of the script's list)
                for (const comment of sourceCode.getAllComments()) check(comment, comment.value, 'a comment');
                for (const comment of sourceCode.ast.templateBody?.comments ?? []) check(comment, comment.value, 'a comment');
            },
            CallExpression(node) {
                if (!testFunctionOf(node.callee)) return;
                const title = node.arguments[0];
                if (title?.type === 'Literal' && typeof title.value === 'string') check(title, title.value, 'a test title');
                else if (title?.type === 'TemplateLiteral') check(title, title.quasis.map(q => q.value.cooked).join(' '), 'a test title');
            }
        };
    }
};
