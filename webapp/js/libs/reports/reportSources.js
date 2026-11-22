// @ts-check
/**
 * Reads the measurement files a report names, one result per source, for the report model: the file as a 3.0
 * document, or the reason it could not be read. A source that fails does not stop the others: the report lists
 * it with its error. A read never writes.
 */
import { parse } from '@/libs/map/measurementFormat';
import { isNotFound } from '@/libs/ddb/apiError';

/**
 * @param {{ getFileContents: (path: string) => Promise<any> }} dataset
 * @param {string} file
 * @returns {Promise<{ file: string, document: Record<string, any> | null } | { file: string, error: string }>}
 */
export async function loadReportSource(dataset, file) {
    let content;
    try {
        content = await dataset.getFileContents(file);
    } catch (e) {
        if (isNotFound(e)) return { file, error: 'The file does not exist' };
        return { file, error: `The file cannot be read: ${e instanceof Error && e.message ? e.message : String(e)}` };
    }
    try {
        const document = parse(content);
        return document ? { file, document } : { file, error: 'The file is empty' };
    } catch (e) {
        return { file, error: e instanceof Error && e.message ? e.message : String(e) };
    }
}

/**
 * The sources of a definition, read all at once.
 * @param {{ getFileContents: (path: string) => Promise<any> }} dataset
 * @param {{ file: string, label: string }[]} sources  the `sources` of the definition
 */
export function loadReportSources(dataset, sources) {
    return Promise.all(sources.map(async source => ({ label: source.label, ...(await loadReportSource(dataset, source.file)) })));
}
