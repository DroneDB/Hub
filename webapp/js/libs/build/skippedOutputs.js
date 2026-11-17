// @ts-check
/**
 * The outputs a build left out because they could not be generated. A model build makes its bm3d
 * output and then its 3D Tiles; when the tiler fails on the file (an OBJ whose vertex colours do
 * not cover every vertex), libddb keeps the build, logs "<output> generation skipped for <path>:
 * <why>" and lists no 3D Tiles. The entry then looks like one built before 3D Tiles existed, which a
 * rebuild fixes, while here a rebuild fails the same way: the build log is what tells them apart.
 *
 * A leaf module (no other build/* imports).
 */

/**
 * @typedef {object} SkippedOutput
 * @property {string} output  the output libddb names ('3D Tiles')
 * @property {string} reason  why, in the words of the tool that failed ('' when the log does not say)
 */

const MARK = ' generation skipped for ';
const TOOL = '[ddb] ';

/**
 * Why an output failed, from the text libddb logged after the path: the exception the tool
 * reported (Obj2Tiles writes "!> Exception: ..."), else the first line of the error without the
 * server path of the file.
 * @param {string} text
 */
function reasonOf(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const exception = lines.filter(line => line.startsWith('!> Exception:')).pop();
    if (exception) return exception.replace(/^!> Exception:\s*/, '');
    const first = lines[0] || '';
    // "Could not build 3D Tiles for /server/path/file.obj: Obj2Tiles exited with code 1:"
    return first.replace(/^Could not build .+? for .+?: (?=\S)/, '').replace(/:\s*$/, '');
}

/**
 * The output the build of `path` skipped, read from the lines of its build log (the last mention
 * wins), or null when the log names none.
 * @param {unknown} lines  the `lines` of the task log
 * @param {string} path  the dataset path of the file
 * @returns {SkippedOutput | null}
 */
export function skippedOutputOf(lines, path) {
    if (!Array.isArray(lines) || !path) return null;
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = typeof lines[i] === 'string' ? lines[i] : '';
        const tool = line.indexOf(TOOL);
        const mark = line.indexOf(MARK + path);
        if (tool < 0 || mark < tool) continue;
        const rest = line.slice(mark + MARK.length + path.length);
        if (rest && !rest.startsWith(':') && !rest.startsWith(' (')) continue; // another file whose path starts with this one
        const output = line.slice(tool + TOOL.length, mark).trim();
        return { output, reason: rest.startsWith(':') ? reasonOf(rest.slice(1)) : '' };
    }
    return null;
}
