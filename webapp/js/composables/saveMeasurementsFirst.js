// @ts-check
/**
 * The question asked before an action that reads the measurements file (a report, a saved view): the measurements on
 * the map that are not in their file yet are offered a Save first.
 *
 *   const answer = await saveMeasurementsFirst(choose, measurements, { message, confirmText, secondaryText });
 *   if (answer === 'cancel') return;   // 'clean' (nothing to save), 'saved', 'skipped' (the user went on without)
 */

/**
 * @param {(options: object) => Promise<'confirm'|'secondary'|'cancel'>} choose
 * @param {{ isDirty: () => boolean, save: () => Promise<void> }} measurements
 * @param {{ title?: string, message: string, confirmText: string, secondaryText: string }} text  the message is HTML: no names in it
 * @returns {Promise<'clean'|'saved'|'skipped'|'cancel'>}  'cancel' too when the save did not save (its alert says why)
 */
export async function saveMeasurementsFirst(choose, measurements, { title = 'Unsaved measurements', message, confirmText, secondaryText }) {
    if (!measurements.isDirty()) return 'clean';
    const answer = await choose({ title, message, confirmText, secondaryText, cancelText: 'Cancel' });
    if (answer === 'cancel') return 'cancel';
    if (answer === 'secondary') return 'skipped';
    await measurements.save();
    return measurements.isDirty() ? 'cancel' : 'saved';
}
