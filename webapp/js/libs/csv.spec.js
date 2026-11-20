import { describe, it, expect, vi, afterEach } from 'vitest';
import { csvField, toCsv, downloadCsv } from './csv';
import * as download from './download';

describe('csv', () => {
    afterEach(() => vi.restoreAllMocks());

    it('quotes a field with a comma, a quote or a line break, and doubles the quotes', () => {
        expect(csvField('a,b')).toBe('"a,b"');
        expect(csvField('say "hi"')).toBe('"say ""hi"""');
        expect(csvField('two\nlines')).toBe('"two\nlines"');
        expect(csvField(' padded ')).toBe('" padded "');
        expect(csvField('plain')).toBe('plain');
    });

    it('writes numbers as they are and nothing for empty values', () => {
        expect(csvField(-12.5)).toBe('-12.5');
        expect(csvField(0)).toBe('0');
        expect(csvField(NaN)).toBe('');
        expect(csvField(null)).toBe('');
        expect(csvField(undefined)).toBe('');
    });

    it('keeps text that a spreadsheet would run as a formula from running', () => {
        expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
        expect(csvField('+1')).toBe("'+1");
        expect(csvField('-north fence')).toBe("'-north fence");
        expect(csvField('@sum')).toBe("'@sum");
    });

    it('ends every row, the header too, with CRLF', () => {
        expect(toCsv(['a', 'b'], [[1, 'x,y'], [null, 2]])).toBe('a,b\r\n1,"x,y"\r\n,2\r\n');
    });

    it('saves the file with a byte order mark so spreadsheets read UTF-8', () => {
        const spy = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
        downloadCsv('unit\r\nm²\r\n', 'm.csv');
        expect(spy).toHaveBeenCalledWith('﻿unit\r\nm²\r\n', 'm.csv', 'text/csv;charset=utf-8');
    });
});
