/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const Tag = require('./tag');
const Dataset = require('./dataset');
const Registry = require('./registry');
const entry = require('./entry');
const thumbs = require('./thumbs');
const fetchEntries = require('./fetchEntries');
const searchEntries = require('./searchEntries');
const utils = require('./utils');
const pathutils = require('./pathutils');
const MergeStrategy = require('./mergeStrategy');
const Visibility = require('./visibility');

const ddb = {
    Tag, Dataset, Registry,
    MergeStrategy, Visibility,
    entry, utils, pathutils,
    fetchEntries,
    searchEntries,
    thumbs,

    tile: {},

    registerNativeBindings: function (n) {
        this.getVersion = n.getVersion;
        this.getDefaultRegistry = n.getDefaultRegistry;

        this.thumbs.getFromUserCache = async function (imagePath, options = {}) {
            return new Promise((resolve, reject) => {
                n._thumbs_getFromUserCache(imagePath, options, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.tile.getFromUserCache = async function (geotiffPath, tz, tx, ty, options = {}) {
            return new Promise((resolve, reject) => {
                n._tile_getFromUserCache(geotiffPath, tz, tx, ty, options, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.info = async function (paths, options = {}) {
            return new Promise((resolve, reject) => {
                if (typeof paths === "string") paths = [paths];

                n.info(paths, options, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.init = async function (directory) {
            return new Promise((resolve, reject) => {
                n.init(directory, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.add = async function (ddbPath, paths, options = {}, progress = () => true) {
            return new Promise((resolve, reject) => {
                if (typeof paths === "string") paths = [paths];

                n.add(ddbPath, this._resolvePaths(ddbPath, paths), options, progress, (err, entries) => {
                    if (err) reject(err);
                    else return resolve(entries);
                });
            });
        };

        this.list = async function (ddbPath, paths = ".", options = {}) {
            return new Promise((resolve, reject) => {
                const isSingle = typeof paths === "string";
                if (isSingle) paths = [paths];

                n.list(ddbPath, this._resolvePaths(ddbPath, paths), options, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.build = async function (ddbPath, options = {}, progress = () => true) {
            return new Promise((resolve, reject) => {
                n.build(ddbPath, options, progress, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.search = async function(ddbPath, query = ".") {
            return new Promise((resolve, reject) => {
                n.search(ddbPath, query, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.get = async function(ddbPath, path){
            return new Promise((resolve, reject) => {
                n.get(ddbPath, path, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };

        this.getStamp = async function(ddbPath) {
            return new Promise((resolve, reject) => {
                n.getStamp(ddbPath, (err, stamp) => {
                    if (err) reject(err);
                    else resolve(stamp);
                });
            });
        };

        this.remove = async function(ddbPath, paths, options = {}) {
            return new Promise((resolve, reject) => {
                if (typeof paths === "string") paths = [paths];
                n.remove(ddbPath, this._resolvePaths(ddbPath, paths), options, err => {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        };

        this.move = async function(ddbPath, source, dest) {
            return new Promise((resolve, reject) => {
                n.move(ddbPath, source, dest, err => {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        };

        this.share = async function(paths, tag, options = {}, progress = () => true){
            return new Promise((resolve, reject) => {
                if (typeof paths === "string") paths = [paths];
                n.share(paths, tag, options, progress, (err, url) => {
                    if (err) reject(err);
                    else resolve(url);
                });
            });
        };

        this.login = async function (username, password, server = "") {
            return new Promise((resolve, reject) => {
                n.login(username, password, server, (err, token) => {
                    if (err) reject(err);
                    else resolve(token);
                });
            });
        };

        this.chattr = async function (ddbPath, attrs = {}) {
            console.warn("DEPRECATED call to chattr (please use meta.set instead)")
            return new Promise((resolve, reject) => {
                n.chattr(ddbPath, attrs, (err, attrs) => {
                    if (err) reject(err);
                    else resolve(attrs);
                });
            });
        };

        this.delta = async function (sourceStamp, targetStamp) {
            return new Promise((resolve, reject) => {
                n.delta(JSON.stringify(sourceStamp), JSON.stringify(targetStamp), (err, delta) => {
                    if (err) reject(err);
                    else resolve(delta);
                });
            });
        };

        this.computeDeltaLocals = async function (ddbPath, delta, hlDestFolder = "") {
            return new Promise((resolve, reject) => {
                n.computeDeltaLocals(ddbPath, JSON.stringify(delta), hlDestFolder, (err, locals) => {
                    if (err) reject(err);
                    else resolve(locals);
                });
            });
        };

        this.applyDelta = async function(delta, sourcePath, ddbPath, sourceMetaDump = [], options = {mergeStrategy: MergeStrategy.KeepTheirs}){
            return new Promise((resolve, reject) => {
                n.applyDelta(JSON.stringify(delta), sourcePath, ddbPath, JSON.stringify(sourceMetaDump), options, (err, conflicts) => {
                    if (err) reject(err);
                    else resolve(conflicts);
                });
            });
        };

        this.meta = {
            add: async function(ddbPath, path, key, data){
                if (path === undefined || path === null) path = "";
                
                return new Promise((resolve, reject) => {
                    n.metaAdd(ddbPath, path, key, JSON.stringify(data), (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            set: async function(ddbPath, path, key, data){
                if (path === undefined || path === null) path = "";

                return new Promise((resolve, reject) => {
                    n.metaSet(ddbPath, path, key, JSON.stringify(data), (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            remove: async function(ddbPath, id){
                return new Promise((resolve, reject) => {
                    n.metaRemove(ddbPath, id, (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            get: async function(ddbPath, path, key){
                if (path === undefined || path === null) path = "";

                return new Promise((resolve, reject) => {
                    n.metaGet(ddbPath, path, key, (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            unset: async function(ddbPath, path, key){
                if (path === undefined || path === null) path = "";

                return new Promise((resolve, reject) => {
                    n.metaUnset(ddbPath, path, key, (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            list: async function(ddbPath, path){
                if (path === undefined || path === null) path = "";

                return new Promise((resolve, reject) => {
                    n.metaList(ddbPath, path, (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },

            dump: async function(ddbPath, ids = ""){
                if (!ids) ids = "[]";

                return new Promise((resolve, reject) => {
                    n.metaDump(ddbPath, ids, (err, meta) => {
                        if (err) reject(err);
                        else resolve(meta);
                    });
                });
            },
        };

        this.shell = {
            copy: async function(from, to, opts = {}){
                return this._shFileOperation("copy", from, to, opts);
            },

            move: async function(from, to, opts = {}){
                return this._shFileOperation("move", from, to, opts);
            },

            delete: async function(files, opts = {}){
                return this._shFileOperation("delete", files, "", opts);
            },

            rename: async function(from, to, opts = {}){
                return this._shFileOperation("rename", from, to, opts);
            },

            _shFileOperation: async function(operation, from, to, opts = {}){
                if (typeof from === 'string') from = [from];
                if (!opts.winId && this._winId) opts.winId = this._winId;
    
                return new Promise((resolve, reject) => {
                    // Black magic: allow progress windows to appear in the foreground!
                    n._shell_AltPress();
                    setTimeout(() => {
                        n._shell_AltRelease();
                    }, 3000);

                    // Actual function call
                    n._shell_SHFileOperation(operation, from, to, opts, (err, result) => {
                        if (err) reject(err);
                        else if (!result) reject(`Cannot execute ${operation}`);
                        else resolve(true);
                    });
                });
            },

            _shTest: function(){
                setTimeout(() => {
                    n._shell_SurrenderForeground();
                }, 2000);
            },

            _setWinId: function(winId){
                this._winId = winId; // Used by Windows to show shell progress dialogs
            }
        };

        this.stac = async function(ddbPath, opts = {}){
            return new Promise((resolve, reject) => {
                n.stac(ddbPath, opts, (err, stac) => {
                    if (err) reject(err);
                    else resolve(stac);
                });
            });
        };

        // Guarantees that paths are expressed with
        // a ddbPath root or are absolute paths
        this._resolvePaths = function (ddbPath, paths) {
            const path = require('path');

            return paths.map(p => {
                if (path.isAbsolute(p)) return p;

                const relative = path.relative(ddbPath, p);

                // Is it relative? Good
                if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return p;

                // Combine
                else return path.join(ddbPath, p);
            });
        }
    }
};

module.exports = ddb;