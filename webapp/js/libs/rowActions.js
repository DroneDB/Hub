/**
 * The actions a list offers on at least one of its rows. `actions` maps the key of each action to whether it applies to
 * a row; the answer maps each key to whether any row has it. A table keeps a place for each of these actions on every
 * row (RowActionSlot), so a button is in the same place on every row, and leaves out an action that no row has.
 */
export function actionsOfAnyRow(rows, actions) {
    return Object.fromEntries(Object.entries(actions).map(([key, applies]) => [key, rows.some(row => applies(row))]));
}
