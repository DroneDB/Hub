/**
 * The Copy AppSettings JSON of the Configuration page has the shape Registry reads: the keys the
 * page only groups are direct keys of AppSettings, a nested section keeps its object, a dotted
 * key is a path from AppSettings, and ConnectionStrings and Serilog sit next to AppSettings.
 */
import { describe, it, expect } from 'vitest';
import { settingPath, setSettingAt, buildAppSettings, PLACEHOLDER } from './appSettingsJson';

const build = settings => {
    const root = {};
    for (const [section, key, value] of settings) setSettingAt(root, settingPath(section, key), value);
    return root;
};

describe('settingPath', () => {
    it('puts the keys the page only groups directly in AppSettings', () => {
        expect(settingPath('UpdateCheck', 'UpdateCheckEmail')).toEqual(['AppSettings', 'UpdateCheckEmail']);
        expect(settingPath('Auth', 'TokenExpirationInDays')).toEqual(['AppSettings', 'TokenExpirationInDays']);
        expect(settingPath('Misc', 'DataProtectionKeysPath')).toEqual(['AppSettings', 'DataProtectionKeysPath']);
    });

    it('keeps the keys of a nested section in its object', () => {
        expect(settingPath('Smtp', 'Host')).toEqual(['AppSettings', 'Smtp', 'Host']);
        expect(settingPath('ProcessingPlatform', 'Tools')).toEqual(['AppSettings', 'ProcessingPlatform', 'Tools']);
        expect(settingPath('HostBudget', 'Cores')).toEqual(['AppSettings', 'HostBudget', 'Cores']);
        expect(settingPath('LdapSettings', 'Server')).toEqual(['AppSettings', 'LdapSettings', 'Server']);
    });

    it('reads a dotted key as a path from AppSettings', () => {
        expect(settingPath('Upload', 'Uploads.MaxChunkBytes')).toEqual(['AppSettings', 'Uploads', 'MaxChunkBytes']);
        expect(settingPath('RedisConfig', 'CacheProvider.Settings.InstanceAddress'))
            .toEqual(['AppSettings', 'CacheProvider', 'Settings', 'InstanceAddress']);
    });

    it('puts the connection strings and the log settings next to AppSettings', () => {
        expect(settingPath('ConnectionStrings', 'RegistryConnection')).toEqual(['ConnectionStrings', 'RegistryConnection']);
        expect(settingPath('Serilog', 'MinimumLevel')).toEqual(['Serilog', 'LevelSwitches', '$controlSwitch']);
    });
});

describe('setSettingAt', () => {
    it('builds one document, merging the keys of a path', () => {
        expect(build([
            ['Providers', 'CacheProvider.Type', 'Redis'],
            ['RedisConfig', 'CacheProvider.Settings.InstanceAddress', 'localhost:6379'],
            ['UpdateCheck', 'UpdateCheckEmail', 'all'],
            ['Smtp', 'Port', 587],
            ['ConnectionStrings', 'RegistryConnection', 'Data Source=./registry.db']
        ])).toEqual({
            AppSettings: {
                CacheProvider: { Type: 'Redis', Settings: { InstanceAddress: 'localhost:6379' } },
                UpdateCheckEmail: 'all',
                Smtp: { Port: 587 }
            },
            ConnectionStrings: { RegistryConnection: 'Data Source=./registry.db' }
        });
    });

    it('writes the log file as the path of the file sink, after the console sink', () => {
        expect(build([['Serilog', 'LogPath', './logs/registry.txt'], ['Serilog', 'MinimumLevel', 'Information']])).toEqual({
            Serilog: {
                WriteTo: [{ Name: 'Console' }, { Name: 'File', Args: { path: './logs/registry.txt' } }],
                LevelSwitches: { $controlSwitch: 'Information' }
            }
        });
    });
});

describe('buildAppSettings (FR-ADM-12, D-005)', () => {
    const field = (key, fieldType, currentValue, extra = {}) =>
        ({ key, fieldType, currentValue, defaultValue: currentValue, sensitive: false, isSet: false, ...extra });
    const SECTIONS = [
        {
            name: 'Auth', fields: [
                field('TokenExpirationInDays', 'number', '7'),
                field('Secret', 'password', null, { sensitive: true, isSet: true, defaultValue: null }),
                field('InstanceId', 'info', 'abc')
            ]
        },
        {
            name: 'Smtp', fields: [
                field('Host', 'text', 'smtp.example.com'),
                field('Password', 'password', null, { sensitive: true, isSet: true, defaultValue: null }),
                field('Port', 'number', '25')
            ]
        },
        {
            name: 'ConnectionStrings', fields: [
                field('RegistryConnection', 'text', 'Data Source=./registry.db'),
                field('Spare', 'password', null, { sensitive: true, isSet: false, defaultValue: null })
            ]
        }
    ];

    it('changes mode: changing only Token Expiration to 30 gives one key', () => {
        const copy = buildAppSettings({ sections: SECTIONS, modified: { '0-0': 30 }, mode: 'changes' });
        expect(JSON.parse(copy.json)).toEqual({ AppSettings: { TokenExpirationInDays: 30 } });
        expect(copy.count).toBe(1);
        expect(copy.placeholders).toEqual([]);
        expect(copy.json).not.toContain(PLACEHOLDER);
    });

    it('changes mode: gives nothing when nothing is edited, and does not count a secret that was not typed again', () => {
        expect(buildAppSettings({ sections: SECTIONS, modified: {}, mode: 'changes' })).toEqual({ json: '{}', count: 0, placeholders: [] });
        // "Change" was pressed on the secret, nothing typed
        expect(buildAppSettings({ sections: SECTIONS, modified: { '0-1': '' }, mode: 'changes' }).count).toBe(0);
    });

    it('changes mode: writes a secret that was typed, where Registry reads it', () => {
        const copy = buildAppSettings({ sections: SECTIONS, modified: { '1-1': 's3cret', '1-2': 587 }, mode: 'changes' });
        expect(JSON.parse(copy.json)).toEqual({ AppSettings: { Smtp: { Password: 's3cret', Port: 587 } } });
        expect(copy.count).toBe(2);
        expect(copy.placeholders).toEqual([]);
    });

    it('full mode: has every setting, the secret that is set as a placeholder, and lists the placeholder settings', () => {
        const copy = buildAppSettings({ sections: SECTIONS, modified: { '0-0': 30 }, mode: 'full' });
        expect(JSON.parse(copy.json)).toEqual({
            AppSettings: {
                TokenExpirationInDays: 30,
                Secret: PLACEHOLDER,
                Smtp: { Host: 'smtp.example.com', Password: PLACEHOLDER, Port: 25 }
            },
            ConnectionStrings: { RegistryConnection: 'Data Source=./registry.db' }
        });
        expect(PLACEHOLDER).toBe('<CHANGE-ME>');
        expect(copy.placeholders).toEqual(['AppSettings:Secret', 'AppSettings:Smtp:Password']);
        expect(copy.count).toBe(6);
    });

    it('full mode: a secret that was typed is written, not listed; a secret that is not set is left out', () => {
        const copy = buildAppSettings({ sections: SECTIONS, modified: { '0-1': 'abc' }, mode: 'full' });
        expect(JSON.parse(copy.json).AppSettings.Secret).toBe('abc');
        expect(copy.placeholders).toEqual(['AppSettings:Smtp:Password']);
        expect(JSON.parse(copy.json).ConnectionStrings).not.toHaveProperty('Spare');
    });

    it('leaves informational values out in both modes, and types the values', () => {
        const sections = [{
            name: 'Misc', fields: [
                field('InstanceId', 'info', 'abc'),
                field('Flag', 'bool', 'False'),
                field('Names', 'array', 'a, b'),
                field('Blob', 'json', '{"a":1}')
            ]
        }];
        const full = JSON.parse(buildAppSettings({ sections, modified: {}, mode: 'full' }).json);
        expect(full).toEqual({ AppSettings: { Flag: false, Names: ['a', 'b'], Blob: { a: 1 } } });
        const changes = JSON.parse(buildAppSettings({ sections, modified: { '0-1': true, '0-2': ['x'] }, mode: 'changes' }).json);
        expect(changes).toEqual({ AppSettings: { Flag: true, Names: ['x'] } });
    });

    it('full mode: a json field whose current value is null is left out, so it does not write null over its default', () => {
        const sections = [{
            name: 'ProcessingPlatform', fields: [
                field('NodeOdx', 'json', null, { defaultValue: '[{"url":"http://node"}]' }),
                field('OrgDailyOutputBytes', 'json', '{"default":100}')
            ]
        }];
        const copy = buildAppSettings({ sections, modified: {}, mode: 'full' });
        expect(JSON.parse(copy.json)).toEqual({ AppSettings: { ProcessingPlatform: { OrgDailyOutputBytes: { default: 100 } } } });
        expect(copy.json).not.toContain('null');
        expect(copy.count).toBe(1);
    });
});
