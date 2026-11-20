import { describe, it, expect } from 'vitest';
import { splitRegistryLink, needsRegistryAddress, REGISTRY_ADDRESS_HINT } from './importSources';

describe('splitRegistryLink', () => {
    it('splits the link of a dataset page into the registry, the organization and the dataset', () => {
        expect(splitRegistryLink('https://hub.dronedb.app/r/odm/brighton-beach')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'brighton-beach'
        });
    });

    it('splits the link of a viewer of a dataset', () => {
        expect(splitRegistryLink(' https://hub.dronedb.app/r/odm/brighton-beach/view/b2R/map?x=1#top ')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'brighton-beach'
        });
    });

    it('keeps the path of a registry served below a prefix', () => {
        expect(splitRegistryLink('http://example.org:5000/registry/r/acme/site')).toEqual({
            url: 'http://example.org:5000/registry', organization: 'acme', dataset: 'site'
        });
    });

    it('takes the organization alone from the link of an organization page', () => {
        expect(splitRegistryLink('https://hub.dronedb.app/r/odm')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: ''
        });
    });

    it('splits a link to the API of a dataset or of an organization', () => {
        expect(splitRegistryLink('https://hub.dronedb.app/orgs/odm/ds/brighton-beach/search')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'brighton-beach'
        });
        expect(splitRegistryLink('https://hub.dronedb.app/orgs/odm/ds')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: ''
        });
    });

    it('splits a ddb tag, with or without a scheme', () => {
        const expected = { url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'brighton-beach' };
        expect(splitRegistryLink('hub.dronedb.app/odm/brighton-beach')).toEqual(expected);
        expect(splitRegistryLink('https://hub.dronedb.app/odm/brighton-beach')).toEqual(expected);
        expect(splitRegistryLink('hub.dronedb.app/r/odm/brighton-beach')).toEqual(expected);
        expect(splitRegistryLink('localhost:5000/acme/site')).toEqual({
            url: 'https://localhost:5000', organization: 'acme', dataset: 'site'
        });
    });

    it('returns null for the address of a registry or for text that is not a link', () => {
        expect(splitRegistryLink('https://hub.dronedb.app')).toBeNull();
        expect(splitRegistryLink('hub.dronedb.app')).toBeNull();
        expect(splitRegistryLink('https://hub.dronedb.app/r')).toBeNull();
        expect(splitRegistryLink('https://hub.dronedb.app/registry')).toBeNull();
        expect(splitRegistryLink('a/b/c')).toBeNull();
        expect(splitRegistryLink('odm')).toBeNull();
        expect(splitRegistryLink('ftp://hub.dronedb.app/r/odm/x')).toBeNull();
        expect(splitRegistryLink('')).toBeNull();
        expect(splitRegistryLink(null)).toBeNull();
    });
});

describe('splitRegistryLink, a ddb tag without a host (FR-UPL-18)', () => {
    it('takes "org/dataset" for a dataset of the default registry, like the ddb command line', () => {
        expect(splitRegistryLink('admin/brighton-beach')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'admin', dataset: 'brighton-beach'
        });
        expect(splitRegistryLink(' odm/aukerman_2 ')).toEqual({
            url: 'https://hub.dronedb.app', organization: 'odm', dataset: 'aukerman_2'
        });
    });

    it('does not take a host or text with three parts or odd characters for a tag', () => {
        expect(splitRegistryLink('a/b/c')).toBeNull();
        expect(splitRegistryLink('odm/brighton beach')).toBeNull();
        expect(splitRegistryLink('odm/')).toBeNull();
    });
});

describe('needsRegistryAddress', () => {
    it('holds for a text with a "/" and no registry in it, and says what to add', () => {
        expect(needsRegistryAddress('a/b/c')).toBe(true);
        expect(needsRegistryAddress('odm/brighton beach')).toBe(true);
        expect(REGISTRY_ADDRESS_HINT).toBe('Add the registry address, e.g. hub.dronedb.app/admin/brighton-beach');
    });

    it('does not hold for a link, an address, a tag or an empty field', () => {
        for (const text of ['admin/brighton-beach', 'hub.dronedb.app/odm/x', 'https://hub.dronedb.app/', 'https://hub.dronedb.app',
            'https://example.org/registry', 'hub.dronedb.app', '', '  ', null])
            expect(needsRegistryAddress(text), String(text)).toBe(false);
    });

    it('does not hold for the address of a registry without a scheme, below a prefix or not', () => {
        for (const text of ['example.org/registry', 'hub.dronedb.app/odm', 'localhost:5000/registry/', 'example.org:8080/a/b/c'])
            expect(needsRegistryAddress(text), text).toBe(false);
    });
});
