/**
 * A report model with three items, and the assets of the PDF around it, for the specs of the PDF.
 */
import { buildReportModel } from '@/libs/reports/reportModel';
import { inputOf, mapFeature, template } from '@/libs/reports/reportModel.fixtures';
import { qrCode } from '@/libs/qr';

export const ORIGIN = 'https://hub.example';
export const REPORT_URL = `${ORIGIN}/r/acme/site/reports/r_k3x9q2m7`;
/** An 8 x 4 JPEG: a real one, so that the PDF library and a PDF reader can open it. */
export const JPEG_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAEAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDqKKKK+rPmj//Z';

const point = (id, ref, props = {}) => mapFeature(id, ref, 'point', { type: 'Point', coordinates: [11, 45] }, { name: `Point ${ref}`, ...props });
const length = (id, ref, props = {}) => mapFeature(id, ref, 'length', { type: 'LineString', coordinates: [[11, 45], [11.001, 45.001]] }, { name: `Line ${ref}`, ...props });

/** Three numbered items (one with a description and photos), and optionally one that is not numbered. */
export function threeItems({ unnumbered = false } = {}) {
    return [
        point('a1', 1, { description: 'Crack, **wide** and long', photos: [{ path: 'photos/a.jpg', source: 'dataset', caption: 'The crack' }] }),
        length('a2', 2),
        point('a3', 3, { name: 'Gate' }),
        ...(unnumbered ? [point('a4', null, { name: 'Draft' })] : [])
    ];
}

/** The model of the report that the page draws, with the template and the links given. */
export function pdfModel({ features = threeItems(), templateExtra = {}, links = {}, input = {} } = {}) {
    return buildReportModel(inputOf(features, {
        settings: { templates: [template({ footerText: 'Confidential', headerText: 'ACME Surveys', ...templateExtra })], schema: undefined },
        links: { reportUrl: REPORT_URL, anchorUrl: item => `${REPORT_URL}#item-${item.anchorId}`, ...links },
        ...input
    }));
}

/** The images of a report, empty: the figures are drawn as their text. */
export const noAssets = () => ({ logo: null, figures: new Map(), photos: new Map() });

/** The images of a report with a figure for each snapshot block and each photo of the model. */
export function fullAssets(model) {
    const assets = { logo: { dataUrl: JPEG_URL, width: 1, height: 1 }, figures: new Map(), photos: new Map() };
    for (const block of model.sections.flatMap(s => s.blocks)) {
        if (block.type === 'mapSnapshot' || block.type === 'chart') assets.figures.set(block, { image: { dataUrl: JPEG_URL, width: 2000, height: 1000 }, note: null });
        if (block.type === 'photoGrid') for (const photo of block.photos) assets.photos.set(photo.path, { dataUrl: JPEG_URL, width: 1600, height: 1200 });
    }
    return assets;
}

export const options = (model, assets = noAssets()) => ({ assets, qr: qrCode, origin: ORIGIN });

/** Every node of a definition's content, depth first (the nodes inside stacks, columns, tables and lists too). */
export function nodesOf(content) {
    const out = [];
    const walk = node => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        out.push(node);
        for (const key of ['stack', 'columns', 'ul', 'ol']) if (node[key]) walk(node[key]);
        if (node.table) node.table.body.forEach(row => row.forEach(walk));
        if (node.toc?.title) walk(node.toc.title);
    };
    walk(content);
    return out;
}

/** The text of a node, runs joined. */
export const textOf = node => (typeof node.text === 'string' ? node.text : Array.isArray(node.text) ? node.text.map(t => (typeof t === 'string' ? t : textOf(t))).join('') : '');

/** Every text of a definition's content, in order. */
export const textsOf = content => nodesOf(content).map(textOf).filter(Boolean);
