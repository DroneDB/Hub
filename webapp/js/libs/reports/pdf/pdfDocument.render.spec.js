/**
 * The definition is turned into a real PDF by pdfmake (with its embedded Roboto): the pages have the size and the
 * orientation of the template, there are as many pages as the layout needs, and the file is a PDF that opens.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { fullAssets, options, pdfModel, threeItems, JPEG_URL } from '@/libs/reports/pdf/pdfDocument.fixtures';
import { definitionOf, mapFeature, square } from '@/libs/reports/reportModel.fixtures';
import { addSymbolsFont } from '@/libs/reports/pdf/pdfSymbols';

let pdfMake;
beforeAll(async () => {
    const library = await import('pdfmake/build/pdfmake');
    const fonts = await import('pdfmake/build/vfs_fonts');
    pdfMake = library.default ?? library;
    pdfMake.addVirtualFileSystem(fonts.default ?? fonts);
    addSymbolsFont(pdfMake);
}, 60000);

/** The PDF as text, with no compression, so that its objects can be read. */
async function render(model, assets) {
    const definition = { ...buildPdfDocument(model, options(model, assets)), compress: false };
    const blob = await pdfMake.createPdf(definition).getBlob();
    return { blob, text: Buffer.from(await blob.arrayBuffer()).toString('latin1') };
}
/**
 * What pdfmake laid out, as the library has it before it writes the file: every text run with its position on its page and
 * the style it was drawn in, and every vector (a fill, a rule) with its place. The positions are in points.
 */
async function laidOut(model, assets) {
    const doc = await pdfMake.createPdf(buildPdfDocument(model, options(model, assets))).getStream();
    const runs = [];
    const vectors = [];
    const pages = doc._pdfMakePages;
    pages.forEach((page, index) => {
        for (const entry of page.items) {
            if (entry.type === 'line') {
                for (const inline of entry.item.inlines) {
                    runs.push({ page: index + 1, x: entry.item.x + inline.x, right: entry.item.x + inline.x + inline.width, y: entry.item.y, text: inline.text, inline });
                }
            } else if (entry.type === 'vector') {
                vectors.push({ page: index + 1, ...entry.item });
            }
        }
    });
    const { width, height } = pages[0].pageSize;
    doc.end();
    return { runs, vectors, pages: pages.length, width, height, rightMargin: width - 40 };
}
/** The text runs that end beyond the right margin of their page (the footer is the margin's own: its page number has padding). */
const pastMargin = laid => laid.runs.filter(run => run.text.trim() && run.right > laid.rightMargin + 0.5 && run.y < laid.height - 56);
const names = runs => runs.map(run => `p${run.page} '${run.text.trim().slice(0, 24)}' ${run.x.toFixed(1)}-${run.right.toFixed(1)}`);

/** One stockpile with ordinary values: the 22-character material name that cannot wrap is what pushed a column off the page. */
const pile = (extra = {}) => mapFeature('s1', '1', 'stockpile', square(9.2, 45.1, 20), {
    name: 'Pile 1', cutVolume: 13000.25, fillVolume: 499.75, netVolume: 12500.5, basePlaneMethod: 'best_fit', materialName: 'Crushed limestone 0-32',
    weightEstimate: { tons: 21000.84, basedOn: 'netVolume' }, costEstimate: { amount: 262506.3, currency: 'EUR' }, currency: 'EUR', category: 'stockpile', status: 'in-progress', ...extra
});

const mediaBoxes = text => [...new Set(text.match(/\/MediaBox \[[^\]]*\]/g))];
const pageCount = text => (text.match(/\/Type \/Page\b/g) || []).length;

describe('the PDF pdfmake writes', () => {
    it('is a PDF with A4 portrait pages', async () => {
        const model = pdfModel({ templateExtra: { paper: 'A4', orientation: 'portrait' } });
        const { blob, text } = await render(model, fullAssets(model));
        expect(blob.size).toBeGreaterThan(5000);
        expect(text.startsWith('%PDF-')).toBe(true);
        expect(mediaBoxes(text)).toEqual(['/MediaBox [0 0 595.28 841.89]']);
    }, 60000);

    it('has Letter landscape pages for a template that says so, and the report is longer than the cover', async () => {
        const model = pdfModel({ templateExtra: { paper: 'Letter', orientation: 'landscape' } });
        const { text } = await render(model, fullAssets(model));
        expect(mediaBoxes(text)).toEqual(['/MediaBox [0 0 792 612]']);
        // cover, contents, summary, overview, tables, three item pages, notes
        expect(pageCount(text)).toBeGreaterThanOrEqual(9);
    }, 60000);

    it('embeds a font and writes the title in the information of the file', async () => {
        const model = pdfModel();
        const { text } = await render(model, fullAssets(model));
        expect(text).toMatch(/\/FontFile2/);
        expect(text).toMatch(/\/Title \d+ 0 R/);
    }, 60000);

    it('is made with no image too (every figure is its text)', async () => {
        const model = pdfModel();
        const { blob } = await render(model, { logo: null, figures: new Map(), photos: new Map() });
        expect(blob.size).toBeGreaterThan(5000);
    }, 60000);

    it('fits the cover on its page, with a tall map and facts on two lines, on every paper and orientation: the contents are on page 2', async () => {
        for (const paper of ['A4', 'Letter']) {
            for (const orientation of ['portrait', 'landscape']) {
                const definition = definitionOf(['a.geojson'], {
                    preparedBy: 'A. Kaczmarek, Northbank Geomatics, field services',
                    preparedFor: 'Reserve management of the municipality (sample client)',
                    sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: true }]
                });
                // Twenty items of four categories: a legend of four entries and a caption on two lines under the map
                const features = Array.from({ length: 20 }, (_, i) => {
                    const f = threeItems()[i % 3];
                    return { ...f, id: `i${i}`, properties: { ...f.properties, id: `i${i}`, ref: String(i + 1), category: ['defect', 'safety', 'observation', 'general'][i % 4], status: i % 2 ? 'open' : 'resolved' } };
                });
                const model = pdfModel({ features, templateExtra: { paper, orientation, headerText: '' }, input: { definition } });
                const assets = fullAssets(model);
                // A map taller than it is wide: the one that fills the most of a page
                for (const [block, figure] of assets.figures) assets.figures.set(block, { ...figure, image: { dataUrl: JPEG_URL, width: 1000, height: 2000 } });
                const { text } = await render(model, assets);
                // cover, contents, summary: a cover that overflows by a margin would add an empty page after it
                expect(pageCount(text), `${paper} ${orientation}`).toBe(3);
            }
        }
    }, 60000);

    it('draws an arrow of a text with the glyph of the symbols font, embedded beside Roboto', async () => {
        const model = pdfModel({ features: threeItems().map(f => ({ ...f, properties: { ...f.properties, description: 'Back beach → berm crest → swash zone' } })) });
        const { text } = await render(model, fullAssets(model));
        expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+ReportSymbols-Regular/);
        expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto/);
    }, 60000);

    it('keeps the styles of a run that has an arrow: a link stays a link and bold stays bold', async () => {
        const description = 'A **bold \u2192 berm** and [a link \u2192 here](https://example.com/a)';
        const model = pdfModel({ features: threeItems().map(f => ({ ...f, properties: { ...f.properties, description } })) });
        const { runs } = await laidOut(model, fullAssets(model));
        const part = text => runs.find(run => run.text.trim() === text);
        expect(part('bold').inline).toMatchObject({ bold: true });
        expect(part('berm').inline).toMatchObject({ bold: true });
        expect(part('a').inline.link).toBeNull();
        expect(runs.filter(run => run.inline.link === 'https://example.com/a').map(run => run.text.trim()).filter(Boolean)).toEqual(expect.arrayContaining(['link', 'here']));
        // The arrow of the link is part of the link, in the font of the symbols
        const arrow = runs.find(run => run.text === '\u2192' && run.inline.link);
        expect(arrow.inline.font.name).toMatch(/ReportSymbols/);
        expect(arrow.inline.decoration).toBe('underline');
    }, 60000);
});

describe('the volumes table of a portrait page', () => {
    it('has its last column on the page for one ordinary pile, on A4 and on Letter', async () => {
        for (const paper of ['A4', 'Letter']) {
            const model = pdfModel({ features: [pile()], templateExtra: { paper, orientation: 'portrait' } });
            const laid = await laidOut(model, fullAssets(model));
            expect(names(pastMargin(laid)), paper).toEqual([]);
            // The columns are all there
            for (const label of ['Cut', 'Net', 'Material', 'Cost', 'Category', 'Status']) expect(laid.runs.some(run => run.text.trim() === label), label).toBe(true);
        }
    }, 120000);

    it('has a long unbroken name wrap in its column in the tables and on the item page, and a long material in the volumes', async () => {
        const word = 'Northquarrybenchstockpile'.repeat(6).slice(0, 140);
        const features = [
            pile({ name: 'Pile 1', materialName: word }),
            mapFeature('p1', '2', 'point', { type: 'Point', coordinates: [9.2, 45.1] }, { name: word, category: 'observation', status: 'open', severity: 'medium', assignee: 'J. Smith', dueDate: '2026-12-01' })
        ];
        const model = pdfModel({ features, templateExtra: { orientation: 'portrait' } });
        const laid = await laidOut(model, fullAssets(model));
        expect(names(pastMargin(laid))).toEqual([]);
    }, 120000);

    it('has a long unbroken assignee and a long word of a description wrap on the item page', async () => {
        const word = 'Northquarrybenchstockpile'.repeat(6).slice(0, 140);
        const point = mapFeature('p1', '1', 'point', { type: 'Point', coordinates: [9.2, 45.1] }, { name: 'Gate', description: `See ${word} now`, category: 'observation', status: 'open', assignee: word });
        const model = pdfModel({ features: [point], templateExtra: { orientation: 'portrait' } });
        const laid = await laidOut(model, fullAssets(model));
        expect(names(pastMargin(laid))).toEqual([]);
    }, 120000);
});

describe('the cover', () => {
    const coverModel = (extra = {}) => pdfModel({ templateExtra: { paper: 'A4', orientation: 'portrait', headerText: '' }, ...extra });

    it('keeps a long title and subtitle in its band, with the facts under it, within the margins', async () => {
        const title = `${'Northern quarry stockpile survey '.repeat(6)}`.trim().slice(0, 200);
        const subtitle = `${'Eastwards benches photos '.repeat(10)}`.trim().slice(0, 200);
        const definition = definitionOf(['a.geojson'], { title, subtitle, preparedBy: 'A. Kaczmarek', sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: true }] });
        const model = coverModel({ input: { definition } });
        const laid = await laidOut(model, fullAssets(model));
        expect(names(pastMargin(laid))).toEqual([]);
        const first = laid.runs.filter(run => run.page === 1);
        const band = laid.vectors.find(v => v.page === 1 && v.type === 'rect' && v.w >= laid.width - 1 && v.h > 50);
        const bandBottom = band.y + band.h;
        const words = [...title.split(' '), ...subtitle.split(' ')].filter(Boolean);
        const titleRuns = first.filter(run => run.text.trim() && words.includes(run.text.trim()));
        expect(titleRuns.length).toBeGreaterThan(20);
        // Every line of the title and the subtitle is inside the band, above its stripe
        for (const run of titleRuns) expect(run.y + run.inline.height, `${run.text} at ${run.y}`).toBeLessThanOrEqual(bandBottom + 0.5);
        // The facts begin under the band, never over the title
        const facts = first.find(run => run.text.trim() === 'Prepared');
        expect(facts.y).toBeGreaterThan(bandBottom);
    }, 120000);

    // Bold capitals are wider than the average letter: a title estimated a line short overflowed its band, and the
    // map, given the room the estimate left, could go to a page of its own and put the contents on page 3
    it('keeps a long title in capitals in its band, with its map on the cover and the contents on page 2', async () => {
        const capitals = (words, length) => {
            let text = '';
            for (let k = 0; text.length < length; k++) text += (text ? ' ' : '') + words[k % words.length];
            return text.slice(0, length).trim();
        };
        for (const [length, subtitleLength] of [[40, 0], [86, 0], [120, 60], [184, 0], [200, 120]]) {
            const title = capitals(['WMWM', 'MOWMW', 'QWMW', 'MWWM'], length);
            const subtitle = capitals(['WMW', 'MWMW'], subtitleLength);
            const definition = definitionOf(['a.geojson'], { title, subtitle, preparedBy: 'A. Kaczmarek', sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: true }, { kind: 'items', enabled: true }] });
            // A stockpile gives the cover its tiles of figures, which leave the map less room
            const model = coverModel({ features: [pile(), ...threeItems()], input: { definition } });
            // A tall map: it takes all the room the cover leaves it
            const assets = fullAssets(model);
            for (const [block, figure] of assets.figures) assets.figures.set(block, { ...figure, image: { ...figure.image, width: 1000, height: 3000 } });
            const laid = await laidOut(model, assets);
            const band = laid.vectors.find(v => v.page === 1 && v.type === 'rect' && v.w >= laid.width - 1 && v.h > 50);
            const words = new Set([...title.split(' '), ...subtitle.split(' ')].filter(Boolean));
            const runs = laid.runs.filter(run => run.page === 1 && words.has(run.text.trim()));
            expect(runs.length, title).toBeGreaterThan(3);
            for (const run of runs) expect(run.y + run.inline.height, `${length}: ${run.text} at ${run.y}`).toBeLessThanOrEqual(band.y + band.h + 0.5);
            expect(laid.runs.find(run => run.text.trim() === 'Contents')?.page, title).toBe(2);
        }
    }, 120000);

    it('has a word of the title with no break in it wrap in the band too', async () => {
        const title = 'N'.repeat(120);
        const definition = definitionOf(['a.geojson'], { title, sections: [{ kind: 'cover', enabled: true }] });
        const model = coverModel({ input: { definition } });
        const laid = await laidOut(model, fullAssets(model));
        expect(names(pastMargin(laid))).toEqual([]);
    }, 120000);

    it('is the first page though the definition lists the cover after other sections: the contents come after it', async () => {
        const definition = definitionOf(['a.geojson'], { sections: [{ kind: 'summary', enabled: true }, { kind: 'cover', enabled: true }, { kind: 'items', enabled: true }] });
        const model = coverModel({ input: { definition } });
        const laid = await laidOut(model, fullAssets(model));
        const band = laid.vectors.find(v => v.type === 'rect' && v.w >= laid.width - 1 && v.h > 50 && v.color === model.template.primary);
        expect(band.page).toBe(1);
        const page = text => laid.runs.find(run => run.text.trim() === text)?.page;
        expect(page('Inspection')).toBe(1);
        expect(page('Contents')).toBe(2);
        // The summary is a page of its own after the contents (its name is also an entry of the contents)
        expect(laid.runs.filter(run => run.text.trim() === 'Summary').at(-1).page).toBeGreaterThan(2);
    }, 120000);
});

describe('the rule of a description', () => {
    it('is as long as the column it is in: it ends within the margin on a portrait page', async () => {
        const description = 'Above the rule\n\n---\n\nBelow the rule, in the notes next to the details';
        const model = pdfModel({ features: threeItems().map(f => ({ ...f, properties: { ...f.properties, description } })), templateExtra: { orientation: 'portrait' } });
        const laid = await laidOut(model, fullAssets(model));
        const rules = laid.vectors.filter(v => v.type === 'line' && v.lineColor === '#94a3b8');
        expect(rules.length).toBeGreaterThanOrEqual(3);
        for (const rule of rules) {
            expect(Math.max(rule.x1, rule.x2)).toBeLessThanOrEqual(laid.rightMargin + 0.5);
            // In the column of the notes, which is the right half of the page
            expect(rule.x2 - rule.x1).toBeLessThan(laid.width / 2);
        }
    }, 120000);
});
