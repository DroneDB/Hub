/**
 * Paste strategies - Strategy pattern for the 4 (mode × scope) combinations.
 *
 * Each strategy exposes:
 *   async execute(items, target, dataset, options) -> { succeeded, failed, skipped }
 *
 * - items:   [{ path, type, size, entry? }]  (from clipboard; `entry` is the
 *             full source entry preserved by useClipboard, used by callers to
 *             repopulate destination entries after paste)
 * - target:  { orgSlug, dsSlug, basePath, dataset }
 * - source:  { orgSlug, dsSlug, basePath, dataset }
 * - options: { conflictMode: 'overwrite'|'skip'|'ask' }
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

class IntraDatasetMoveStrategy {
    async execute(items, source, target, options) {
        const result = buildResult();
        const dataset = target.dataset;
        const overwrite = options.conflictMode === 'overwrite';

        for (const item of items) {
            const dest = destFor(item, target);
            if (item.path === dest) { result.skipped.push(item.path); continue; }
            try {
                // Server-side move uses PUT /obj which doesn't accept overwrite=true natively.
                // We follow the same flow as drag&drop rename (single endpoint, server enforces).
                await dataset.moveObj(item.path, dest);
                result.succeeded.push({ source: item.path, dest });
            } catch (err) {
                if (!overwrite && options.conflictMode === 'skip') {
                    result.skipped.push(item.path);
                } else {
                    result.failed[item.path] = err.message || String(err);
                }
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

class CrossDatasetMoveStrategy {
    async execute(items, source, target, options) {
        const result = buildResult();
        const sourceDs = source.dataset;
        const overwrite = options.conflictMode === 'overwrite';

        for (const item of items) {
            const destPath = destFor(item, target);
            try {
                await sourceDs.transferObj(item.path, target.orgSlug, target.dsSlug, destPath, overwrite, false);
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

class CrossDatasetCopyStrategy {
    async execute(items, source, target, options) {
        const result = buildResult();
        const sourceDs = source.dataset;
        const overwrite = options.conflictMode === 'overwrite';

        for (const item of items) {
            const destPath = destFor(item, target);
            try {
                // keepSource=true => copy semantics on the transfer endpoint
                await sourceDs.transferObj(item.path, target.orgSlug, target.dsSlug, destPath, overwrite, true);
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
    if (!sameDataset && mode === 'cut') return new CrossDatasetMoveStrategy();
    if (!sameDataset && mode === 'copy') return new CrossDatasetCopyStrategy();
    throw new Error(`Cannot resolve paste strategy for mode='${mode}'`);
}

export {
    IntraDatasetMoveStrategy,
    IntraDatasetCopyStrategy,
    CrossDatasetMoveStrategy,
    CrossDatasetCopyStrategy
};
