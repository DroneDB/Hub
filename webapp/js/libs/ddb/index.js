/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Tag from './tag';
import Dataset from './dataset';
import Registry from './registry';
import entry from './entry';
import thumbs from './thumbs';
import fetchEntries from './fetchEntries';
import searchEntries from './searchEntries';
import utils from './utils';
import pathutils from './pathutils';
import MergeStrategy from './mergeStrategy';
import Visibility from './visibility';

const ddb = {
    Tag, Dataset, Registry,
    MergeStrategy, Visibility,
    entry, utils, pathutils,
    fetchEntries,
    searchEntries,
    thumbs
};

export { Tag, Dataset, Registry, MergeStrategy, Visibility, entry, utils, pathutils, fetchEntries, searchEntries, thumbs };
export default ddb;
