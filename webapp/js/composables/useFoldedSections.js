// @ts-check
/**
 * useFoldedSections - which parts of a form are open (FormSection in an Accordion with `multiple`), remembered for the
 * session: a part the user opened is open again the next time the form shows, one the user closed is closed. A part
 * can also open because of what the form holds (`opened`: an Inspection with values), without the user's choice being
 * changed by it.
 *
 *   const sections = useFoldedSections('measurement-properties', { opened: () => hasValues ? ['inspection'] : [] });
 *   <Accordion v-model:value="sections.open.value" multiple> ... </Accordion>
 *   sections.reveal('inspection');   // a check in it failed: the user must see it
 */
import { ref, watch } from 'vue';

/** The parts each form was left with open, by the user */
const remembered = new Map();

/**
 * @param {string} form  the name of the form (the dialogs that share a name share the choice)
 * @param {{ opened?: () => string[] }} [options]
 */
export function useFoldedSections(form, { opened = () => [] } = {}) {
    /** @type {Set<string>} */
    const chosen = remembered.get(form) ?? new Set();
    remembered.set(form, chosen);
    const open = ref([...new Set([...chosen, ...opened()])]);

    /** Parts the form is opening by itself (reveal): their opening is not a choice of the user's */
    const automatic = new Set();

    // What the user opens or closes is remembered; what the form opens by itself is not. The Accordion changes the
    // array in place (a push): the change is found against a copy, not the watcher's old value
    let previous = [...open.value];
    watch(open, now => {
        now.filter(s => !previous.includes(s)).forEach(s => {
            if (automatic.delete(s)) return;
            chosen.add(s);
        });
        previous.filter(s => !now.includes(s)).forEach(s => chosen.delete(s));
        previous = [...now];
    }, { deep: true });

    /** Opens a part (not a choice of the user's: it is not remembered). @param {string} section */
    function reveal(section) {
        if (open.value.includes(section)) return;
        automatic.add(section);
        open.value = [...open.value, section];
    }

    return { open, reveal };
}

/** Forgets the choices (tests). */
export function _resetFoldedSectionsForTests() {
    remembered.clear();
}
