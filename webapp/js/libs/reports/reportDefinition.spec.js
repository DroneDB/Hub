import { describe, it, expect } from 'vitest';
import { defaultState } from '@/libs/views/viewState';
import {
    DEFINITION_VERSION, SECTION_KINDS, MEASUREMENT_KINDS, OWNERS, MAX_TEXT_LENGTH, MAX_NOTES_LENGTH,
    emptyFilter, passesFilter, nextSourceLabel, addSource, sectionsFromTemplate, newDefinition, validateDefinition
} from './reportDefinition';

/** A definition that can be saved. */
function valid(extra = {}) {
    return {
        uid: 'r_k3x9q2m7',
        version: DEFINITION_VERSION,
        name: 'North pit',
        templateId: 'standard',
        title: 'Inspection',
        subtitle: '',
        preparedBy: '',
        preparedFor: '',
        notes: 'Some **notes**',
        sources: [{ file: 'survey/measurements.geojson', label: 'A' }, { file: 'survey/cloud_measurements.geojson', label: 'B' }],
        filter: { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: ['map', 'pointCloud'] },
        cover: { viewId: 'v_abcd1234' },
        sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: false }],
        units: null,
        createdBy: 'jdoe',
        createdAt: '2026-11-21T10:00:00Z',
        modifiedAt: '2026-11-21T10:00:00Z',
        ...extra
    };
}

const problem = extra => validateDefinition(valid(extra)).error;

describe('validateDefinition', () => {
    it('accepts a definition, with either kind of cover and every unit', () => {
        expect(validateDefinition(valid())).toEqual({ error: null, newerVersion: false });
        const viewState = defaultState({ path: 'a/o.tif', hash: 'h' }, { baseIsGeoraster: true });
        expect(problem({ cover: { viewState } })).toBeNull();
        expect(problem({ units: 'metric' })).toBeNull();
        expect(problem({ units: 'imperial' })).toBeNull();
        expect(problem({ sections: [] })).toBeNull();
    });

    it('does not check a definition of a later version further', () => {
        expect(validateDefinition({ version: DEFINITION_VERSION + 1 })).toEqual({ error: null, newerVersion: true });
    });

    it('refuses what is not an object or has no version', () => {
        for (const x of [null, undefined, 'text', [1], 3]) expect(validateDefinition(x).error).toBe('not an object');
        expect(problem({ version: undefined })).toBe('no version');
        expect(problem({ version: 0 })).toBe('no version');
        expect(problem({ version: '1' })).toBe('no version');
    });

    it('refuses a uid that is not r_ and 8 base36 characters', () => {
        for (const uid of [undefined, '', 'v_k3x9q2m7', 'r_k3x9q2m', 'r_K3X9Q2M7', 'r_k3x9q2m77']) expect(problem({ uid })).toBe('the uid is not valid');
    });

    it('refuses a template id that is not 1 to 32 of a-z, 0-9 and -', () => {
        for (const templateId of [undefined, '', 'Standard', 'a b', 'x'.repeat(33), 3]) expect(problem({ templateId })).toBe('the template is not valid');
        expect(problem({ templateId: 'x'.repeat(32) })).toBeNull();
    });

    it('limits the texts', () => {
        for (const field of ['title', 'subtitle', 'preparedBy', 'preparedFor']) {
            expect(problem({ [field]: 'x'.repeat(MAX_TEXT_LENGTH) })).toBeNull();
            expect(problem({ [field]: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toMatch(new RegExp(`the ${field} must be text`));
            expect(problem({ [field]: undefined })).toMatch(/must be text/);
            expect(problem({ [field]: 4 })).toMatch(/must be text/);
        }
        expect(problem({ notes: 'x'.repeat(MAX_NOTES_LENGTH) })).toBeNull();
        expect(problem({ notes: 'x'.repeat(MAX_NOTES_LENGTH + 1) })).toMatch(/the notes must be text/);
        expect(problem({ notes: null })).toMatch(/the notes/);
    });

    describe('sources', () => {
        it('needs at least one', () => {
            expect(problem({ sources: [] })).toBe('at least one source is needed');
            expect(problem({ sources: undefined })).toBe('at least one source is needed');
            expect(problem({ sources: 'a' })).toBe('at least one source is needed');
        });

        it('refuses a source that is not an object or has an unsafe path', () => {
            expect(problem({ sources: ['a.geojson'] })).toBe('a source is not valid');
            for (const file of [undefined, '', '../x.geojson', '/abs.geojson', 'a/../../x.geojson']) {
                expect(problem({ sources: [{ file, label: 'A' }] })).toBe('a source file path is not valid');
            }
        });

        it('takes a label of 1 to 3 characters A-Z or 0-9, unique', () => {
            for (const label of ['A', 'Z9', 'A1B', '007']) expect(problem({ sources: [{ file: 'a.geojson', label }] })).toBeNull();
            for (const label of ['', 'a', 'ABCD', 'A-', 'A B', undefined, 1]) {
                expect(problem({ sources: [{ file: 'a.geojson', label }] })).toMatch(/source label must be 1 to 3/);
            }
            expect(problem({ sources: [{ file: 'a.geojson', label: 'A' }, { file: 'b.geojson', label: 'A' }] })).toBe('a source label is used twice');
        });

        it('refuses the same file twice', () => {
            expect(problem({ sources: [{ file: 'a.geojson', label: 'A' }, { file: 'a.geojson', label: 'B' }] })).toBe('a source file is listed twice');
        });
    });

    describe('filter', () => {
        it('needs the six lists', () => {
            expect(problem({ filter: undefined })).toBe('the filter is not valid');
            expect(problem({ filter: [] })).toBe('the filter is not valid');
            for (const list of ['groups', 'categories', 'severities', 'statuses', 'kinds', 'owners']) {
                const filter = { ...emptyFilter() };
                delete filter[list];
                expect(problem({ filter })).toMatch(new RegExp(`the filter ${list} are not a list`));
            }
        });

        it('takes the measurement kinds and owners it knows, and text for the others', () => {
            expect(problem({ filter: { ...emptyFilter(), kinds: [...MEASUREMENT_KINDS], owners: [...OWNERS] } })).toBeNull();
            expect(problem({ filter: { ...emptyFilter(), kinds: ['circle'] } })).toMatch(/"circle" is not a value of the filter kinds/);
            expect(problem({ filter: { ...emptyFilter(), owners: ['3d'] } })).toMatch(/not a value of the filter owners/);
            expect(problem({ filter: { ...emptyFilter(), groups: ['g1'], categories: ['defect'], severities: ['high'], statuses: ['open'] } })).toBeNull();
            for (const list of ['groups', 'categories', 'severities', 'statuses']) {
                expect(problem({ filter: { ...emptyFilter(), [list]: [''] } })).toMatch(/a filter value/);
                expect(problem({ filter: { ...emptyFilter(), [list]: [3] } })).toMatch(/a filter value/);
            }
        });
    });

    describe('cover', () => {
        it('is exactly one of viewId or viewState', () => {
            const viewState = defaultState({ path: 'a/o.tif', hash: 'h' }, { baseIsGeoraster: true });
            expect(problem({ cover: null })).toBe('a cover view is needed');
            expect(problem({ cover: undefined })).toBe('a cover view is needed');
            expect(problem({ cover: {} })).toBe('the cover is either a saved view or a view state');
            expect(problem({ cover: { viewId: 'v_1', viewState } })).toBe('the cover is either a saved view or a view state');
        });

        it('needs a viewId that is text of 1 to 64 characters', () => {
            for (const viewId of ['', 7, null, 'x'.repeat(65)]) expect(problem({ cover: { viewId } })).toBe('the cover view is not valid');
            expect(problem({ cover: { viewId: 'x'.repeat(64) } })).toBeNull();
        });

        it('needs a viewState that passes the view rules', () => {
            const viewState = defaultState({ path: 'a/o.tif', hash: 'h' }, { baseIsGeoraster: true });
            expect(problem({ cover: { viewState: { ...viewState, base: { path: '../x.tif', hash: '' } } } })).toMatch(/the cover view state is not valid: the base file path/);
            expect(problem({ cover: { viewState: 'x' } })).toMatch(/the cover view state is not valid: not an object/);
            expect(problem({ cover: { viewState: { ...viewState, v: viewState.v + 1 } } })).toBe('the cover view state is of a later version');
        });
    });

    describe('sections', () => {
        it('takes the six kinds, once each, on or off', () => {
            expect(problem({ sections: SECTION_KINDS.map(kind => ({ kind, enabled: true })) })).toBeNull();
            expect(problem({ sections: [{ kind: 'map', enabled: true }] })).toBe('a section kind is not valid');
            expect(problem({ sections: ['cover'] })).toBe('a section kind is not valid');
            expect(problem({ sections: [{ kind: 'cover' }] })).toBe('a section is not switched on or off');
            expect(problem({ sections: [{ kind: 'cover', enabled: 1 }] })).toBe('a section is not switched on or off');
            expect(problem({ sections: [{ kind: 'cover', enabled: true }, { kind: 'cover', enabled: false }] })).toBe('a section is listed twice');
            expect(problem({ sections: undefined })).toBe('the sections are not a list');
        });
    });

    it('takes null, metric or imperial for the units', () => {
        for (const units of [undefined, 'si', 'Metric', 1]) expect(problem({ units })).toBe('the units are not valid');
    });

    it('takes the audit fields as text when they are there', () => {
        expect(problem({ createdBy: undefined, createdAt: undefined, modifiedAt: undefined })).toBeNull();
        expect(problem({ modifiedAt: 5 })).toBe('modifiedAt is not text');
    });
});

describe('passesFilter', () => {
    const item = { group: 'g1', category: 'defect', severity: 'high', status: 'open', kind: 'area', owner: 'map' };

    it('restricts nothing with no filter or empty lists', () => {
        expect(passesFilter(null, item)).toBe(true);
        expect(passesFilter(undefined, {})).toBe(true);
        expect(passesFilter(emptyFilter(), {})).toBe(true);
        expect(passesFilter({}, item)).toBe(true);
    });

    it('passes an item whose value is in each non-empty list', () => {
        expect(passesFilter({ ...emptyFilter(), statuses: ['open', 'resolved'], kinds: ['area'], owners: ['map', 'pointCloud'] }, item)).toBe(true);
    });

    it('fails an item that fails any list', () => {
        for (const [list, wrong] of [['groups', 'g2'], ['categories', 'safety'], ['severities', 'low'], ['statuses', 'resolved'], ['kinds', 'point'], ['owners', 'pointCloud']]) {
            expect(passesFilter({ ...emptyFilter(), [list]: [wrong] }, item)).toBe(false);
        }
        expect(passesFilter({ ...emptyFilter(), statuses: ['open'], kinds: ['point'] }, item)).toBe(false);
    });

    it('fails an item with no value for a field a non-empty list tests, and only that list', () => {
        const bare = { kind: 'area', owner: 'map' };
        expect(passesFilter({ ...emptyFilter(), statuses: ['open'] }, bare)).toBe(false);
        expect(passesFilter({ ...emptyFilter(), categories: ['defect'] }, { ...bare, category: null })).toBe(false);
        expect(passesFilter({ ...emptyFilter(), severities: ['low'] }, { ...bare, severity: '' })).toBe(false);
        expect(passesFilter({ ...emptyFilter(), kinds: ['area'], owners: ['map'] }, bare)).toBe(true);
    });
});

describe('source labels', () => {
    it('go A, B, C... and take the first one that is free', () => {
        expect(nextSourceLabel([])).toBe('A');
        expect(nextSourceLabel(['A', 'B'])).toBe('C');
        expect(nextSourceLabel(['A', 'C'])).toBe('B');
    });

    it('go on with AA after Z, and to three characters', () => {
        const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
        expect(nextSourceLabel(letters)).toBe('AA');
        expect(nextSourceLabel([...letters, 'AA'])).toBe('AB');
        const twoLetters = letters.flatMap(a => letters.map(b => a + b));
        expect(nextSourceLabel([...letters, ...twoLetters])).toBe('AAA');
    });

    it('are given to a source that is added, once per file', () => {
        let sources = addSource([], 'a.geojson');
        sources = addSource(sources, 'b.geojson');
        expect(sources).toEqual([{ file: 'a.geojson', label: 'A' }, { file: 'b.geojson', label: 'B' }]);
        expect(addSource(sources, 'a.geojson')).toBe(sources);
        expect(addSource(sources.slice(1), 'c.geojson').map(s => s.label)).toEqual(['B', 'A']);
    });
});

describe('sectionsFromTemplate', () => {
    it('puts the template sections on, in its order, and the others off', () => {
        expect(sectionsFromTemplate(['summary', 'cover', 'notes'])).toEqual([
            { kind: 'summary', enabled: true }, { kind: 'cover', enabled: true }, { kind: 'notes', enabled: true },
            { kind: 'overview', enabled: false }, { kind: 'tables', enabled: false }, { kind: 'items', enabled: false }
        ]);
    });

    it('ignores kinds it does not know and repeats, and puts every section on when the template has none listed', () => {
        expect(sectionsFromTemplate(['cover', 'cover', 'bogus']).filter(s => s.enabled)).toEqual([{ kind: 'cover', enabled: true }]);
        expect(sectionsFromTemplate(undefined).map(s => s.enabled)).toEqual(SECTION_KINDS.map(() => true));
        expect(sectionsFromTemplate([]).every(s => !s.enabled)).toBe(true);
    });
});

describe('newDefinition', () => {
    it('starts empty, which cannot be saved yet', () => {
        const d = newDefinition({ template: { id: 'tpl', defaultSections: ['cover', 'tables'] } });
        expect(d).toMatchObject({
            version: DEFINITION_VERSION, name: '', templateId: 'tpl', title: '', notes: '', sources: [], cover: null, units: null,
            filter: emptyFilter()
        });
        expect(d.sections.filter(s => s.enabled).map(s => s.kind)).toEqual(['cover', 'tables']);
        expect(validateDefinition({ ...d, uid: 'r_k3x9q2m7' }).error).toBe('at least one source is needed');
    });

    it('takes the sources, labelled in order, and the cover it is given, and is valid then', () => {
        const d = newDefinition({ name: 'N', sources: ['a.geojson', 'b.geojson', 'a.geojson'], cover: { viewId: 'v_1' }, units: 'imperial' });
        expect(d.sources).toEqual([{ file: 'a.geojson', label: 'A' }, { file: 'b.geojson', label: 'B' }]);
        expect(d.templateId).toBe('standard');
        expect(validateDefinition({ ...d, uid: 'r_k3x9q2m7' })).toEqual({ error: null, newerVersion: false });
    });

    it('copies the sections: a later change of the template does not reach the definition', () => {
        const template = { id: 'tpl', defaultSections: ['cover', 'summary'] };
        const d = newDefinition({ template });
        template.defaultSections.splice(0, 1);
        expect(d.sections.find(s => s.kind === 'cover')).toEqual({ kind: 'cover', enabled: true });
        expect(newDefinition({ template }).sections.find(s => s.kind === 'cover')).toEqual({ kind: 'cover', enabled: false });
    });

    it('does not share its lists between definitions', () => {
        const a = newDefinition();
        const b = newDefinition();
        a.filter.groups.push('g');
        a.sections[0].enabled = false;
        expect(b.filter.groups).toEqual([]);
        expect(b.sections[0].enabled).toBe(true);
    });
});
