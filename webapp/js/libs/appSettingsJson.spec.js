/**
 * The Copy AppSettings JSON of the Configuration page has the shape Registry reads: the keys the
 * page only groups are direct keys of AppSettings, a nested section keeps its object, a dotted
 * key is a path from AppSettings, and ConnectionStrings and Serilog sit next to AppSettings.
 */
import { describe, it, expect } from 'vitest';
import { settingPath, setSettingAt } from './appSettingsJson';

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
