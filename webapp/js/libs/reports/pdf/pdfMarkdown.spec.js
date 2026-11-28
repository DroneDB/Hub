import { describe, it, expect } from 'vitest';
import { markdownToPdf } from '@/libs/reports/pdf/pdfMarkdown';
import { nodesOf, textOf } from '@/libs/reports/pdf/pdfDocument.fixtures';

const runsOf = nodes => nodes.flatMap(n => (Array.isArray(n.text) ? n.text : []));

describe('markdownToPdf', () => {
    it('is nothing for no text', () => {
        expect(markdownToPdf('')).toEqual([]);
        expect(markdownToPdf('   \n ')).toEqual([]);
        expect(markdownToPdf(null)).toEqual([]);
    });

    it('is a paragraph of text for a line', () => {
        const [paragraph] = markdownToPdf('Plain words');
        expect(textOf(paragraph)).toBe('Plain words');
    });

    it('marks bold, italic, strike-through and code runs', () => {
        const runs = runsOf(markdownToPdf('a **b** *c* ~~d~~ `e`'));
        expect(runs.find(r => r.text === 'b')).toMatchObject({ bold: true });
        expect(runs.find(r => r.text === 'c')).toMatchObject({ italics: true });
        expect(runs.find(r => r.text === 'd')).toMatchObject({ decoration: 'lineThrough' });
        expect(runs.find(r => r.text === 'e')).toHaveProperty('background');
    });

    it('makes lists, nested ones too', () => {
        const [list, numbered] = markdownToPdf('- one\n- two\n  - inner\n\n1. first\n2. second');
        expect(list.ul).toHaveLength(2);
        expect(nodesOf(list).some(n => n.ul && n.ul.length === 1)).toBe(true);
        expect(numbered.ol).toHaveLength(2);
    });

    it('makes headings, quotes, code blocks, rules and tables as content', () => {
        const nodes = markdownToPdf('# Title\n\n> quoted\n\n```\ncode\n```\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |');
        expect(textOf(nodes[0])).toBe('Title');
        expect(nodes[0].bold).toBe(true);
        expect(nodes[1].stack).toBeDefined();
        expect(nodes[2].text).toBe('code');
        expect(nodes[3].table.widths).toEqual(['*']);
        const table = nodes[4].table;
        expect(table.body.map(row => row.map(textOf))).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('draws a link to a web address, and nothing but the text for any other', () => {
        const runs = runsOf(markdownToPdf('[site](https://example.com/a) [bad](javascript:alert(1)) [mail](mailto:a@b.c) [data](data:text/html,x)'));
        expect(runs.find(r => r.text === 'site')).toMatchObject({ link: 'https://example.com/a', decoration: 'underline' });
        expect(runs.filter(r => r.link).map(r => r.link)).toEqual(['https://example.com/a']);
        expect(runs.map(r => r.text).join('')).toContain('javascript:alert(1)');
    });

    it('writes an image as its description: no image is fetched', () => {
        const nodes = markdownToPdf('![a cat](https://evil.example/cat.png)');
        expect(JSON.stringify(nodes)).not.toContain('evil.example');
        expect(textOf(nodes[0])).toBe('a cat');
        expect(nodesOf(nodes).some(n => n.image)).toBe(false);
    });

    it('keeps HTML as the text it is: nothing is interpreted', () => {
        const nodes = markdownToPdf('<b>x</b> <script>alert(1)</script>\n\n<div onclick="x()">y</div>');
        expect(nodes.map(textOf).join('|')).toBe('<b>x</b> <script>alert(1)</script>|<div onclick="x()">y</div>');
        expect(JSON.stringify(nodes)).not.toMatch(/"(html|image|svg|link)"/);
    });

    it('colours links with the colour it is given', () => {
        const runs = runsOf(markdownToPdf('[x](https://a.example)', { link: '#123456' }));
        expect(runs[0].color).toBe('#123456');
    });
});
