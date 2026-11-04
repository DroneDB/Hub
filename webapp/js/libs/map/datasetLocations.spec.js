import { describe, it, expect } from 'vitest';
import { transformExtent } from 'ol/proj';
import { buildLocations, bboxExtent, organizationColours } from './datasetLocations';

const group = (org, datasets, orgName) => ({ org, orgName, datasets });
const dataset = (slug, bbox, name) => ({ slug, name, bbox });

describe('bboxExtent', () => {
    it('is the box in Web Mercator', () => {
        const [a, b, c, d] = bboxExtent([10, 40, 12, 42]);
        const expected = transformExtent([10, 40, 12, 42], 'EPSG:4326', 'EPSG:3857');
        expect([a, b, c, d]).toEqual(expected);
    });

    it('stays finite at the poles', () => {
        expect(bboxExtent([-180, -90, 180, 90]).every(Number.isFinite)).toBe(true);
    });
});

describe('buildLocations', () => {
    it('pins each dataset at the centre of its box, with what the map shows of it', () => {
        const { features } = buildLocations([group('acme', [dataset('roof', [10, 40, 12, 42], 'Roof')], 'Acme Inc')]);
        expect(features).toHaveLength(1);
        const [pin] = features;
        const [minX, minY, maxX, maxY] = bboxExtent([10, 40, 12, 42]);
        expect(pin.getGeometry().getCoordinates()).toEqual([(minX + maxX) / 2, (minY + maxY) / 2]);
        expect(pin.getId()).toBe('acme/roof');
        expect(pin.getProperties()).toMatchObject({ org: 'acme', orgName: 'Acme Inc', slug: 'roof', name: 'Roof', bbox: [10, 40, 12, 42] });
        expect(typeof pin.get('colour')).toBe('string');
    });

    it('names a dataset by its slug and an organization by its slug when they have no name', () => {
        const { features } = buildLocations([group('acme', [dataset('a', [1, 1, 2, 2], null)])]);
        expect(features[0].get('name')).toBe('a');
        expect(features[0].get('orgName')).toBe('acme');
    });

    it('leaves out the datasets with no usable box', () => {
        const { features } = buildLocations([group('acme', [
            dataset('ok', [1, 1, 2, 2], 'Ok'),
            dataset('none', null, 'None'),
            dataset('short', [1, 2, 3], 'Short'),
            dataset('nan', [1, 2, NaN, 4], 'Nan'),
            dataset('zero', [0, 0, 0, 0], 'Zero')
        ])]);
        expect(features.map(f => f.get('slug'))).toEqual(['ok']);
    });

    it('gives each organization its own colour, the same for all of its pins', () => {
        const { features, legend } = buildLocations([
            group('a', [dataset('a1', [1, 1, 2, 2]), dataset('a2', [3, 3, 4, 4])]),
            group('b', [dataset('b1', [5, 5, 6, 6])])
        ]);
        const colour = slug => features.find(f => f.get('slug') === slug).get('colour');
        expect(colour('a1')).toBe(colour('a2'));
        expect(colour('a1')).not.toBe(colour('b1'));
        expect(legend).toEqual([{ org: 'a', orgName: 'a', colour: colour('a1') }, { org: 'b', orgName: 'b', colour: colour('b1') }]);
    });

    it('gives an organization the same colour whatever order the groups arrive in', () => {
        const colours = organizationColours(['b', 'a', 'c']);
        const a = group('a', [dataset('a1', [1, 1, 2, 2])]);
        const b = group('b', [dataset('b1', [3, 3, 4, 4])]);
        const c = group('c', [dataset('c1', [5, 5, 6, 6])]);
        const colourOf = (legend, org) => legend.find(entry => entry.org === org).colour;
        const arrivals = [[a], [c], [b, c], [c, a, b], [a, b, c]].map(groups => buildLocations(groups, colours).legend);
        for (const legend of arrivals) {
            for (const entry of legend) expect(entry.colour).toBe(colours[entry.org]);
        }
        expect(colourOf(arrivals[3], 'a')).toBe(colourOf(arrivals[4], 'a'));
    });

    it('keeps the colours apart after a search narrowed the set to one organization and was cleared', () => {
        const colours = organizationColours(['a', 'b', 'c']);
        const a = group('a', [dataset('a1', [1, 1, 2, 2])]);
        const b = group('b', [dataset('b1', [3, 3, 4, 4])]);
        const c = group('c', [dataset('c1', [5, 5, 6, 6])]);
        const searched = buildLocations([c], colours).legend;
        const cleared = buildLocations([a, b, c], colours).legend;
        expect(cleared.find(entry => entry.org === 'c').colour).toBe(searched[0].colour);
        expect(new Set(cleared.map(entry => entry.colour)).size).toBe(3);
    });

    it('colours the groups by their own organizations when it is given no colours', () => {
        const a = group('a', [dataset('a1', [1, 1, 2, 2])]);
        const b = group('b', [dataset('b1', [3, 3, 4, 4])]);
        const expected = organizationColours(['a', 'b']);
        expect(buildLocations([b, a]).legend.map(entry => entry.colour)).toEqual([expected.b, expected.a]);
    });

    it('gives an organization missing from the colours one of its own, not one of the palette', () => {
        const colours = organizationColours(['a']);
        const { legend } = buildLocations([group('a', [dataset('a1', [1, 1, 2, 2])]), group('z', [dataset('z1', [3, 3, 4, 4])])], colours);
        expect(legend[1].colour).toMatch(/^hsla\(/);
        expect(legend[1].colour).not.toBe(legend[0].colour);
    });

    it('leaves an organization without a pin out of the legend, and builds nothing from nothing', () => {
        const { legend } = buildLocations([group('a', [dataset('x', null)]), group('b', [])]);
        expect(legend).toEqual([]);
        expect(buildLocations([])).toEqual({ features: [], legend: [] });
    });
});

describe('organizationColours', () => {
    it('gives each organization the colour of its place among them sorted, whatever their order', () => {
        expect(organizationColours(['gamma', 'alpha', 'beta'])).toEqual(organizationColours(['beta', 'gamma', 'alpha']));
        expect(organizationColours(['alpha', 'alpha', 'beta'])).toEqual(organizationColours(['beta', 'alpha']));
    });

    it('gives distinct colours up to the size of the palette, and one from the slug beyond it', () => {
        const slugs = Array.from({ length: 14 }, (_, i) => `org-${String(i).padStart(2, '0')}`);
        const colours = organizationColours(slugs);
        const palette = slugs.slice(0, 12).map(slug => colours[slug]);
        expect(new Set(palette).size).toBe(12);
        expect(palette.every(colour => colour.startsWith('rgba('))).toBe(true);
        expect(colours['org-12']).toMatch(/^hsla\(/);
        expect(colours['org-13']).toMatch(/^hsla\(/);
    });
});
