import { describe, it, expect } from 'vitest';
import { buildPdfDocument, CONTENTS_TITLE } from '@/libs/reports/pdf/pdfDocument';
import { figureBox } from '@/libs/reports/pdf/pdfLayout';
import { qrCode } from '@/libs/qr';
import { ORIGIN, REPORT_URL, JPEG_URL, fullAssets, nodesOf, noAssets, options, pdfModel, textOf, textsOf, threeItems } from '@/libs/reports/pdf/pdfDocument.fixtures';

const build = (model, assets) => buildPdfDocument(model, options(model, assets));
const headings = content => nodesOf(content).filter(n => ['h1', 'h2', 'h3', 'coverTitle', 'coverSubtitle'].includes(n.style));
const qrNodes = content => nodesOf(content).filter(n => typeof n.svg === 'string');

describe('the page', () => {
    it('is A4 portrait for a template that says so', () => {
        const definition = build(pdfModel({ templateExtra: { paper: 'A4', orientation: 'portrait' } }));
        expect(definition.pageSize).toBe('A4');
        expect(definition.pageOrientation).toBe('portrait');
    });

    it('is Letter landscape for a template that says so', () => {
        const definition = build(pdfModel({ templateExtra: { paper: 'Letter', orientation: 'landscape' } }));
        expect(definition.pageSize).toBe('LETTER');
        expect(definition.pageOrientation).toBe('landscape');
    });

    it('has the margins that leave room for the header and the footer', () => {
        const [left, top, right, bottom] = build(pdfModel()).pageMargins;
        expect(top).toBeGreaterThanOrEqual(60);
        expect(bottom).toBeGreaterThanOrEqual(50);
        expect(left).toBe(right);
    });

    it('is set in Roboto, which the PDF embeds', () => {
        expect(build(pdfModel()).defaultStyle.font).toBe('Roboto');
    });

    it('is titled with the title of the report', () => {
        expect(build(pdfModel()).info.title).toBe('Inspection');
    });
});

describe('the header and the footer', () => {
    it('has the logo, the title and the header text of the template in the header of every page', () => {
        const model = pdfModel();
        const header = build(model, fullAssets(model)).header(3, 9);
        const nodes = nodesOf(header);
        expect(nodes.some(n => n.image === JPEG_URL)).toBe(true);
        expect(textsOf(header)).toEqual(['Inspection', 'ACME Surveys']);
    });

    it('has no logo when the report has none, and no header text when the template has none', () => {
        const model = pdfModel({ templateExtra: { headerText: '' } });
        const header = build(model).header(1, 1);
        expect(nodesOf(header).some(n => n.image)).toBe(false);
        expect(textsOf(header)).toEqual(['Inspection']);
    });

    it('has the footer text and "n / total" in the footer, for the page and the page count the library gives', () => {
        const footer = build(pdfModel()).footer(2, 7);
        expect(textsOf(footer)).toEqual(['Confidential', '2 / 7']);
        expect(textsOf(build(pdfModel()).footer(7, 7))).toContain('7 / 7');
    });

    it('has the page number alone when the template has no footer text', () => {
        const footer = build(pdfModel({ templateExtra: { footerText: '' } })).footer(1, 3);
        expect(textsOf(footer)).toEqual(['1 / 3']);
    });
});

describe('the contents', () => {
    it('has a table of contents after the cover, listing the sections and the item pages', () => {
        const { content } = build(pdfModel());
        const nodes = nodesOf(content);
        const tocIndex = content.findIndex(n => n.toc);
        expect(tocIndex).toBeGreaterThan(0);
        expect(textOf(content[tocIndex].toc.title)).toBe(CONTENTS_TITLE);
        // the cover is before it and is not listed; each other section and each item is
        const listed = nodes.filter(n => n.tocItem).map(textOf);
        expect(listed).toEqual(expect.arrayContaining(['Summary', 'Overview map', 'Tables', 'Items', 'Notes', '1 Point 1', '2 Line 2', '3 Gate']));
        expect(listed).not.toContain('Inspection');
    });

    it('starts with the contents when the cover is switched off', () => {
        const model = pdfModel({ input: {} });
        const noCover = { ...model, sections: model.sections.filter(s => s.kind !== 'cover') };
        expect(build(noCover).content[0].toc).toBeDefined();
    });

    it('has no contents when there is nothing to list', () => {
        const model = pdfModel();
        const onlyCover = { ...model, sections: model.sections.filter(s => s.kind === 'cover') };
        expect(build(onlyCover).content.some(n => n.toc)).toBe(false);
    });

    it('starts every section and the contents on a page of its own, and each item on one too', () => {
        const { content } = build(pdfModel());
        // contents, then summary, overview, tables, items, notes
        expect(content.filter(n => n.pageBreak === 'before' && !n.id)).toHaveLength(6);
        // an item heading starts a page except the first, which follows the heading of its section on its page
        const items = nodesOf(content).filter(n => n.tocItem && n.id);
        expect(items.map(n => Boolean(n.pageBreak))).toEqual([false, true, true]);
    });
});

describe('the sections and their values: the page and the PDF are the same report', () => {
    it('has the headings of the model in the order of the model', () => {
        const model = pdfModel({ features: threeItems({ unnumbered: true }) });
        const expected = model.sections.flatMap(s => s.blocks).filter(b => b.type === 'heading').map(b => b.text);
        const got = headings(build(model).content).map(textOf);
        // the contents title is the PDF's own
        expect(got.filter(t => t !== CONTENTS_TITLE)).toEqual(expected);
    });

    it('has the items in the order of the model, the unnumbered last', () => {
        const model = pdfModel({ features: threeItems({ unnumbered: true }) });
        const expected = model.items.map(i => `${i.displayRef} ${i.name}`.trim());
        const got = nodesOf(build(model).content).filter(n => n.tocItem && n.style === 'h2').map(textOf);
        expect(got).toEqual(expected);
        expect(got.at(-1)).toMatch(/Draft$/);
    });

    it('writes every cell of every table as the model wrote it', () => {
        const model = pdfModel();
        const tables = model.sections.flatMap(s => s.blocks).filter(b => b.type === 'table');
        expect(tables.length).toBeGreaterThan(0);
        const pdfTables = nodesOf(build(model).content).filter(n => n.table?.headerRows === 1);
        expect(pdfTables).toHaveLength(tables.length);
        tables.forEach((table, i) => {
            const [header, ...rows] = pdfTables[i].table.body;
            expect(header.map(textOf)).toEqual(table.columns.map(c => c.label));
            rows.forEach((row, r) => {
                expect(row.map(textOf)).toEqual(table.columns.map(c => `${table.rows[r].cells[c.key]}${table.rows[r].note && c.key === 'name' ? ` (${table.rows[r].note})` : ''}`));
            });
        });
    });

    it('writes the key values of every item as the model wrote them', () => {
        const model = pdfModel();
        const all = textsOf(build(model).content);
        for (const block of model.sections.flatMap(s => s.blocks).filter(b => b.type === 'keyValue')) {
            for (const row of block.rows) {
                expect(all).toContain(row.label);
                expect(all).toContain(row.value);
            }
        }
    });

    it('writes the summary counts and totals as the page does', () => {
        const model = pdfModel();
        const summary = model.sections.find(s => s.kind === 'summary').blocks.find(b => b.type === 'summaryStats');
        const all = textsOf(build(model).content);
        expect(all).toContain(`${summary.total.text}${summary.overdue.count ? ` (${summary.overdue.text} overdue)` : ''}`);
        for (const count of summary.byStatus) expect(all).toContain(`${count.label}: ${count.count}`);
    });

    it('has the sections the model has, and none when the definition switches them off', () => {
        const model = pdfModel();
        const without = { ...model, sections: model.sections.filter(s => s.kind !== 'tables') };
        expect(textsOf(build(without).content)).not.toContain('Tables');
        expect(textsOf(build(model).content)).toContain('Tables');
    });

    it('links the first column of a table to the page of the item', () => {
        const nodes = nodesOf(build(pdfModel()).content);
        const links = nodes.filter(n => n.linkToDestination);
        expect(links.length).toBeGreaterThan(0);
        const destinations = new Set(nodes.filter(n => n.id).map(n => n.id));
        for (const link of links) expect(destinations.has(link.linkToDestination)).toBe(true);
    });

    it('does not link to a page the report does not have', () => {
        const model = pdfModel();
        const withoutItems = { ...model, sections: model.sections.filter(s => s.kind !== 'items') };
        expect(nodesOf(build(withoutItems).content).filter(n => n.linkToDestination)).toEqual([]);
    });

    it('gives each item page one destination, even when two items share an anchor', () => {
        const model = pdfModel();
        const items = model.sections.find(s => s.kind === 'items');
        const copy = items.blocks.find(b => b.type === 'heading' && b.anchor);
        const twice = { ...model, sections: model.sections.map(s => (s === items ? { ...s, blocks: [...s.blocks, { ...copy }] } : s)) };
        const ids = nodesOf(build(twice).content).filter(n => n.id).map(n => n.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('the QR codes', () => {
    it('are one for the live page on the cover and one for each numbered item', () => {
        const model = pdfModel({ features: threeItems({ unnumbered: true }) });
        const qr = model.sections.flatMap(s => s.blocks).filter(b => b.type === 'qr');
        expect(qr.map(b => b.url)).toEqual([REPORT_URL, `${REPORT_URL}#item-a1`, `${REPORT_URL}#item-a2`, `${REPORT_URL}#item-a3`]);
        // the item that is not numbered has none
        expect(qrNodes(build(model).content)).toHaveLength(4);
    });

    it('encode the address of the item on the live page, not a viewer route', () => {
        const model = pdfModel({ links: { viewerUrl: item => `/r/acme/site/views/v?item=${item.id}` } });
        const definition = build(model);
        const svgs = qrNodes(definition.content).map(n => n.svg);
        const expected = [REPORT_URL, ...model.items.map(i => `${REPORT_URL}#item-${i.id}`)].map(url => qrCode(url).path);
        expect(svgs.map(svg => /d="([^"]+)"/.exec(svg)[1])).toEqual(expected);
        const viewer = qrCode('/r/acme/site/views/v?item=a1').path;
        expect(svgs.every(svg => !svg.includes(viewer))).toBe(true);
    });

    it('are made only for an address on the origin of the Hub', () => {
        const model = pdfModel({ links: { reportUrl: 'https://evil.example/r/x', anchorUrl: item => `https://evil.example/r/x#item-${item.id}` } });
        const content = build(model).content;
        expect(qrNodes(content)).toHaveLength(0);
        // the address is still written, so that nothing is hidden
        expect(textsOf(content)).toContain('https://evil.example/r/x');
    });

    it('are made for the origin the build is given, port and scheme included', () => {
        const model = pdfModel();
        expect(qrNodes(buildPdfDocument(model, { assets: noAssets(), qr: qrCode, origin: 'http://hub.example' }).content)).toHaveLength(0);
        expect(qrNodes(buildPdfDocument(model, { assets: noAssets(), qr: qrCode, origin: ORIGIN }).content).length).toBeGreaterThan(0);
    });
});

describe('the images', () => {
    it('are the figures that were prepared, within the box of their block, and the text of the block under them', () => {
        const model = pdfModel();
        const assets = fullAssets(model);
        const nodes = nodesOf(build(model, assets).content);
        const images = nodes.filter(n => n.image === JPEG_URL);
        const snapshots = model.sections.flatMap(s => s.blocks).filter(b => b.type === 'mapSnapshot');
        expect(images.length).toBeGreaterThanOrEqual(snapshots.length);
        const overview = model.sections.find(s => s.kind === 'overview').blocks.find(b => b.type === 'mapSnapshot');
        const box = figureBox({ contentWidth: 515.28, contentHeight: 715.89 }, overview);
        const drawn = images.find(n => Math.abs(n.fit[0] - box.widthPt) < 1);
        expect(drawn).toBeTruthy();
        expect(textsOf(build(model, assets).content)).toContain(overview.alt);
    });

    it('are rendered no larger than 2000 px on the long side, however wide the page', () => {
        const model = pdfModel({ templateExtra: { paper: 'Letter', orientation: 'landscape' } });
        for (const block of model.sections.flatMap(s => s.blocks).filter(b => b.type === 'mapSnapshot' || b.type === 'chart')) {
            const box = figureBox({ contentWidth: 712, contentHeight: 486 }, block);
            expect(Math.max(box.widthPx, box.heightPx)).toBeLessThanOrEqual(2000);
        }
    });

    it('show the text of a figure that could not be made, and its note', () => {
        const model = pdfModel();
        const assets = noAssets();
        const snapshot = model.sections.flatMap(s => s.blocks).find(b => b.type === 'mapSnapshot');
        assets.figures.set(snapshot, { image: null, note: 'Snapshot not available: boom' });
        const texts = textsOf(build(model, assets).content);
        expect(texts).toContain(`${snapshot.alt} - Snapshot not available: boom`);
    });

    it('print the note of the model and the note of the renderer under a figure', () => {
        const model = pdfModel({ input: { coverView: { deleted: true } } });
        const assets = noAssets();
        const overview = model.sections.find(s => s.kind === 'overview').blocks.find(b => b.type === 'mapSnapshot');
        expect(overview.note).toContain('The cover view was deleted');
        assets.figures.set(overview, { image: { dataUrl: JPEG_URL, width: 10, height: 5 }, note: 'Basemap not shown: provider does not allow export' });
        const texts = textsOf(build(model, assets).content);
        expect(texts).toContain(`${overview.alt} - ${overview.note} - Basemap not shown: provider does not allow export`);
    });

    it('print the note of the model when the renderer has none', () => {
        const model = pdfModel({ input: { coverView: { deleted: true } } });
        const overview = model.sections.find(s => s.kind === 'overview').blocks.find(b => b.type === 'mapSnapshot');
        expect(textsOf(build(model, noAssets()).content)).toContain(`${overview.alt} - ${overview.note}`);
    });

    it('show a photo that could not be read as "Missing photo" with its path, and keep its caption', () => {
        const model = pdfModel();
        const texts = textsOf(build(model, noAssets()).content);
        expect(texts.join('\n')).toContain('Missing photo');
        expect(texts.join('\n')).toContain('photos/a.jpg');
        expect(texts).toContain('The crack');
    });

    it('put the photos in rows of two on a portrait page and three on a landscape one', () => {
        const photos = Array.from({ length: 5 }, (_, i) => ({ path: `p/${i}.jpg`, source: 'dataset' }));
        const features = [threeItems()[2]].map(f => ({ ...f, properties: { ...f.properties, photos } }));
        const rowsOf = model => nodesOf(build(model, fullAssets(model)).content).filter(n => n.columns && n.columns.every(c => c.stack && c.width !== undefined && typeof c.width === 'number'));
        expect(rowsOf(pdfModel({ features })).map(r => r.columns.length)).toEqual([2, 2, 1]);
        expect(rowsOf(pdfModel({ features, templateExtra: { orientation: 'landscape' } })).map(r => r.columns.length)).toEqual([3, 2]);
    });
});

describe('the text of the user', () => {
    it('is text: the notes are not interpreted as HTML', () => {
        const model = pdfModel();
        const notes = model.sections.find(s => s.kind === 'notes');
        const hostile = { ...model, sections: model.sections.map(s => (s === notes ? { ...s, blocks: [...s.blocks, { type: 'markdown', text: '<script>alert(1)</script> <img src=x onerror=alert(2)> **bold** [x](javascript:alert(3))' }] } : s)) };
        const content = build(hostile).content;
        const texts = textsOf(content).join('\n');
        expect(texts).toContain('<script>alert(1)</script>');
        expect(nodesOf(content).some(n => typeof n.link === 'string' && n.link.startsWith('javascript:'))).toBe(false);
        expect(JSON.stringify(content)).not.toContain('"html"');
    });

    it('keeps the disclaimer of the template as text', () => {
        const model = pdfModel({ templateExtra: { disclaimer: 'Not **legal** advice.' } });
        const paragraphs = nodesOf(build(model).content).filter(n => Array.isArray(n.text) && n.text.some(run => run.text === 'legal' && run.bold));
        expect(paragraphs.map(textOf)).toEqual(['Not legal advice.']);
    });
});
