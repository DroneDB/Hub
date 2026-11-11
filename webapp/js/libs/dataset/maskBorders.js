// @ts-check
/**
 * Mask Borders (FR-PRC-12): the heavy tool `mask-borders` writes the masked copy of a georaster next to it,
 * `<name>_masked.tif`. The Registry decides that name (MaskBordersTool.MaskedOutputPath); the Hub needs it to ask before it
 * replaces a copy that is in the listing, and to put the new file in the list when the task ends.
 */

/** The tool id of the heavy-task API. */
export const MASK_BORDERS_TOOL = 'mask-borders';

/**
 * The dataset path of the masked copy of `path`: its name without the extension, `_masked.tif`, in the same folder.
 * @param {string} path  a dataset path ('mask/black2.tif')
 * @returns {string}  'mask/black2_masked.tif'
 */
export function maskedOutputPath(path) {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    // As Path.GetFileNameWithoutExtension of the Registry does: the last dot starts the extension
    const stem = dot >= 0 ? name.slice(0, dot) : name;
    return `${path.slice(0, slash + 1)}${stem}_masked.tif`;
}
