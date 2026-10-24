/**
 * HUB-08 local rule: a file must remove every listener, bus subscription and interval
 * it adds, or mark why it need not with a `// lifetime: app|element|owner|paired` comment.
 * Same counting as scripts/audit_listeners.mjs (scripts/lib/listenerAudit.mjs).
 */
import path from 'node:path';
import { auditSource, auditsTimeouts, HELPER_FILES } from '../scripts/lib/listenerAudit.mjs';

const JS_ROOT = path.join('webapp', 'js') + path.sep;

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Listeners added in a file must be removed by that file (HUB-08)' },
        schema: [],
        messages: {
            unpaired: 'Listeners or timers not removed: addEventListener {{add}}/{{rem}}, setInterval {{si}}/{{ci}}, setTimeout {{st}}/{{ct}}, on {{on}}/{{off}}. '
                + 'Use useListenerBag/useEventListener or composables/useTimers, remove them on unmount, or add a `// lifetime:` comment.'
        }
    },
    create(context) {
        const file = context.filename;
        const idx = file.lastIndexOf(JS_ROOT);
        const rel = idx >= 0 ? file.slice(idx + JS_ROOT.length).split(path.sep).join('/') : file;
        if (HELPER_FILES.has(rel) || /\.(spec|test)\./.test(file) || /[\\/]vendor[\\/]/.test(file)) return {};
        return {
            'Program:exit'(node) {
                const r = auditSource(context.sourceCode.text, { timeouts: auditsTimeouts(rel) });
                if (r.unpaired) context.report({ node, loc: { line: 1, column: 0 }, messageId: 'unpaired', data: r });
            }
        };
    }
};
