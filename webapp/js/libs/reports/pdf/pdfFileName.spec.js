import { describe, it, expect } from 'vitest';
import { localDateStamp, pdfFileName, publishedPath, PUBLISH_FOLDER } from '@/libs/reports/pdf/pdfFileName';

describe('pdfFileName', () => {
    const day = new Date(2026, 10, 5, 23, 59, 0);

    it('is the slug of the name and the local date', () => {
        expect(pdfFileName({ name: 'North Pit: Inspection', uid: 'r_k3x9q2m7' }, day)).toBe('north-pit-inspection-2026-11-05.pdf');
    });

    it('takes the date in the local time of the browser, not UTC', () => {
        // 23:59 local on the 5th is the 5th whatever the offset of the machine
        expect(localDateStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
        expect(localDateStamp(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
    });

    it('is the uid of the report when the name gives no slug', () => {
        expect(pdfFileName({ name: '   ', uid: 'r_k3x9q2m7' }, day)).toBe('r_k3x9q2m7-2026-11-05.pdf');
        expect(pdfFileName({ name: '', uid: 'r_k3x9q2m7' }, day)).toBe('r_k3x9q2m7-2026-11-05.pdf');
    });

    it('is published in the reports folder at the root of the dataset', () => {
        expect(PUBLISH_FOLDER).toBe('reports');
        expect(publishedPath('north-pit-2026-11-05.pdf')).toBe('reports/north-pit-2026-11-05.pdf');
    });
});
