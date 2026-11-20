/**
 * Paste strategies - Strategy pattern for the 4 (mode × scope) combinations.
 *
 * Each strategy exposes:
 *   async execute(items, target, dataset, options) -> { succeeded, failed, skipped }
 *
 * - items:   [{ path, type, size, entry? }]  (from clipboard; `entry` is the
 *             full source entry preserved by the clipboard store, used by callers to
 *             repopulate destination entries after paste)
 * - target:  { orgSlug, dsSlug, basePath, dataset }
 * - source:  { orgSlug, dsSlug, basePath, dataset }
 * - options: { conflictMode: 'overwrite'|'skip'|'ask' } (copies and transfers); a move inside one dataset
 *            takes { names: { [path]: freeName }, skip: [path] } instead (it cannot overwrite)
 *
 * The active dataset for API calls depends on the strategy:
 *   - intra:  uses target.dataset (== source.dataset)
 *   - cross:  uses source.dataset for transfer (server pulls from there)
 *
 * Notes on path semantics:
 *   - server "dest" is the FULL destination path inside the dataset, e.g.
 *     basePath + "/" + basename(srcPath). For cross-dataset transfer the
 *     "destPath" parameter has the same meaning.
 *   - basePath of "" means dataset root.
 */
import ddb from 'ddb';
const { pathutils } = ddb;

function joinPath(base, name) {
    if (!base) return name;
    if (base.endsWith('/')) return base + name;
    return base + '/' + name;
}

function destFor(item, target) {
    return joinPath(target.basePath || '', pathutils.basename(item.path));
}

function buildResult() {
    return { succeeded: [], failed: {}, skipped: [] };
}

/**
 * A move inside one dataset (PUT /obj). The Registry refuses a move onto a name that exists (409, D-040) and the
 * endpoint has no overwrite: a conflict is decided before the paste, per item, as Keep both (`options.names`: the
 * free name the item gets in the target folder) or Skip (`options.skip`: not sent). Any refusal is a failure.
 */
class IntraDatasetMoveStrategy {
    async execute(items, source, target, options) {
        const result = buildResult();
        const dataset = target.dataset;
        const names = options.names || {};
        const skip = new Set(options.skip || []);

        for (const item of items) {
            if (skip.has(item.path)) { result.skipped.push(item.path); continue; }
            const dest = names[item.path] ? joinPath(target.basePath || '', names[item.path]) : destFor(item, target);
            if (item.path === dest) { result.skipped.push(item.path); continue; }
            try {
                await dataset.moveObj(item.path, dest);
                result.succeeded.push({ source: item.path, dest });
            } catch (err) {
                result.failed[item.path] = err.message || String(err);
            }
        }
        return result;
    }
}

class IntraDatasetCopyStrategy {
    async execute(items, source, target, options) {
        const result = buildResult();
        const dataset = target.dataset;
        const overwrite = options.conflictMode === 'overwrite';

        for (const item of items) {
            const dest = destFor(item, target);
            if (item.path === dest) {
                result.failed[item.path] = "Cannot copy onto itself";
                continue;
            }
            try {
                await dataset.copyObj(item.path, dest, overwrite);
                result.succeeded.push({ source: item.path, dest });
            } catch (err) {
                if (options.conflictMode === 'skip') {
                    result.skipped.push(item.path);
                } else {
                    result.failed[item.path] = err.message || String(err);
                }
            }
        }
        return result;
    }
}

// The server's transfer endpoint moves or copies: `keepSource` is the difference
class CrossDatasetStrategy {
    constructor(keepSource) {
        this.keepSource = keepSource;
    }

    async execute(items, source, target, options) {
        const result = buildResult();
        const sourceDs = source.dataset;
        const overwrite = options.conflictMode === 'overwrite';

        for (const item of items) {
            const destPath = destFor(item, target);
            try {
                await sourceDs.transferObj(item.path, target.orgSlug, target.dsSlug, destPath, overwrite, this.keepSource);
                result.succeeded.push({ source: item.path, dest: destPath });
            } catch (err) {
                if (options.conflictMode === 'skip') {
                    result.skipped.push(item.path);
                } else {
                    result.failed[item.path] = err.message || String(err);
                }
            }
        }
        return result;
    }
}

/**
 * Resolve the right strategy for a given clipboard + paste target.
 * @param {object} clipboardSource - { orgSlug, dsSlug }
 * @param {string} mode - 'copy' | 'cut'
 * @param {object} target - { orgSlug, dsSlug }
 * @returns IPasteStrategy
 */
export function resolvePasteStrategy(clipboardSource, mode, target) {
    const sameDataset = clipboardSource
        && clipboardSource.orgSlug === target.orgSlug
        && clipboardSource.dsSlug === target.dsSlug;

    if (sameDataset && mode === 'cut') return new IntraDatasetMoveStrategy();
    if (sameDataset && mode === 'copy') return new IntraDatasetCopyStrategy();
    if (!sameDataset && (mode === 'cut' || mode === 'copy')) return new CrossDatasetStrategy(mode === 'copy');
    throw new Error(`Cannot resolve paste strategy for mode='${mode}'`);
}
