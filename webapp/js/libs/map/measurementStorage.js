/**
 * Handles saving and loading of GeoJSON measurement files. What is in the file (the version, the
 * application, the view sections, the migration of old files) is measurementFormat's: this reads
 * the file through it and writes what it gives back.
 */
import { pathutils } from 'ddb';
import { downloadText } from '@/libs/download';
import { notify } from '@/libs/notify';
import { isNotFound } from '@/libs/ddb/apiError';
import { isListed } from '@/libs/optionalFile';
import { VIEW, ownerOf, sectionOf, parse, write, MeasurementFileError } from '@/libs/map/measurementFormat';

/** Whether a path is a measurements file (`<name>_measurements.geojson` or `measurements.geojson`). */
export function isMeasurementFile(path) {
    return path.endsWith('_measurements.geojson') || pathutils.basename(path) === 'measurements.geojson';
}

/**
 * The views that keep measurements in the same file: the 2D map and the 3D point-cloud viewer
 * (the map of a folder with a point cloud saves next to it, like the 3D viewer does).
 */
export const MeasurementOwner = VIEW;

export { ownerOf };

const OWNER_LABEL = Object.freeze({ [MeasurementOwner.MAP]: '2D map', [MeasurementOwner.POINT_CLOUD]: '3D viewer' });

/**
 * What a save or a delete did, for the message of either view.
 * @param {{ fileName: string, count: number, deleted: boolean, owner: string }} result
 */
export function saveResultMessage(result) {
    if (result.count) return `Saved ${result.count} measurement${result.count > 1 ? 's' : ''} to "${result.fileName}"`;
    if (result.deleted) return `Removed "${result.fileName}": no measurements left`;
    const other = OWNER_LABEL[result.owner === MeasurementOwner.MAP ? MeasurementOwner.POINT_CLOUD : MeasurementOwner.MAP];
    return `Removed the ${OWNER_LABEL[result.owner]} measurements from "${result.fileName}" (the ${other} ones stay)`;
}

/**
 * A save that the view's last read of the file makes unsafe: while the file is being read, or after a read that
 * failed, the view does not show what the file holds, and a save would replace it with what the view shows.
 */
export class MeasurementNotLoadedError extends Error {
    /** @param {'pending'|'failed'} loadState */
    constructor(loadState) {
        super(loadState === 'failed'
            ? 'The saved measurements could not be loaded, so saving now would replace them. Reload them first.'
            : 'The saved measurements are still loading. Save again when they are shown.');
        this.name = 'MeasurementNotLoadedError';
        this.loadState = loadState;
    }
}

/**
 * A save that would lose saved measurements the view cannot show: they are in another coordinate system than the point
 * cloud now has, which they cannot be converted to (measurementFormat's savedPositions). The view leaves them out; a
 * save would write what it shows, and the file would lose them (or label them with a CRS they are not in).
 */
export class MeasurementNotPlacedError extends Error {
    /** @param {number} count  the saved measurements that are not shown */
    constructor(count) {
        super(`${count === 1 ? '1 saved measurement is' : `${count} saved measurements are`} in another coordinate system than `
            + 'this point cloud and cannot be converted to it, so they are not shown. Saving is turned off so that the file keeps them.');
        this.name = 'MeasurementNotPlacedError';
        this.count = count;
    }
}

/**
 * Tells the user that a save was refused, when it is (see MeasurementStorage.saveRefusal), and says whether it was.
 * After a failed read the notice offers to read the file again; the action runs only while it still applies: the
 * view still has this storage (`isCurrent`: not another target, another viewer, a page that was left) and the read
 * is still failed (not already read again by an earlier click or another notice).
 * @param {MeasurementStorage} storage
 * @param {() => boolean} isCurrent  whether the view still works on `storage`
 * @param {() => (void | Promise<void>)} reload  reads the file again
 * @returns {boolean} true when the save is refused
 */
export function notifySaveRefused(storage, isCurrent, reload) {
    const refusal = storage.saveRefusal;
    if (!refusal) return false;
    notify.warn(refusal.message, {
        summary: 'Not saved',
        life: 'long',
        action: refusal.loadState === 'failed'
            ? { label: 'Reload', run: () => (isCurrent() && storage.loadState === 'failed' ? reload() : undefined) }
            : undefined
    });
    return true;
}

/**
 * The measurements file of an entry, as one view sees it. A view loads, saves and deletes its own
 * measurements only: those of the other view stay in the file as they are, and the file goes when
 * nothing is left in it.
 */
export class MeasurementStorage {
    /**
     * @param {Dataset} dataset - ddb dataset
     * @param {Entry} entry - the entry the measurements belong to (a raster, a point cloud or a folder's file)
     * @param {string} [owner] - the view that reads and writes (a MeasurementOwner)
     * @param {{ pointCloudCrs?: any }} [options] - `pointCloudCrs`: the SRS (or coordinate system) of the point cloud,
     *   for the migration of a file that does not state its own
     */
    constructor(dataset, entry, owner = MeasurementOwner.MAP, options = {}) {
        this.dataset = dataset;
        this.entry = entry;
        this.owner = owner;
        this.pointCloudCrs = options.pointCloudCrs ?? null;
        this.measurementPath = this.getMeasurementPath();
        /**
         * What the last read of the file did: 'idle' (none yet), 'pending' (in flight), 'loaded' or 'failed'. A
         * save is refused while it is pending or failed (see saveRefusal).
         * @type {'idle'|'pending'|'loaded'|'failed'}
         */
        this.loadState = 'idle';
        this._loadTurn = 0;
        /**
         * How many of this view's saved measurements the view could not show (keepUnplaced): a save is refused while
         * there are any, so the file keeps them.
         */
        this.unplaced = 0;
    }

    /**
     * Says that the view could not show `count` of the measurements it loaded (they are in a coordinate system it
     * cannot convert): saves are refused until a load shows them all, or the user deletes the saved measurements.
     * @param {number} count
     */
    keepUnplaced(count) {
        this.unplaced = count > 0 ? count : 0;
    }

    /**
     * Why a save would not be safe now, or null. A view saves what it shows into the file in place of its own
     * measurements in it: when its read of the file is still in flight or failed, it shows less than the file
     * holds, and the save would lose the rest.
     * @returns {MeasurementNotLoadedError|null}
     */
    get saveRefusal() {
        if (this.loadState === 'pending' || this.loadState === 'failed') return new MeasurementNotLoadedError(this.loadState);
        return this.unplaced ? new MeasurementNotPlacedError(this.unplaced) : null;
    }

    /**
     * Generate the measurements file path
     * @returns {string} GeoJSON file path
     */
    getMeasurementPath() {
        const path = this.entry.path;

        // If the path is already a measurements file, use it directly
        if (isMeasurementFile(path)) return path;

        // Remove extension and add _measurements.geojson
        return `${pathutils.dropExtension(path)}_measurements.geojson`;
    }

    _owns(feature) {
        return ownerOf(feature) === this.owner;
    }

    /**
     * The file as a 2.0 document, migrated in memory (a read never writes).
     * A file that is not there is the Registry's 404 (the client's ApiError with status 404, for a
     * missing file and for a folder that is not there either): the first save makes it. An empty file
     * (a 200 with no body) is a new file too. Any other failure (a network error, 401, 403, 5xx) is
     * not a missing file: the read throws, so a save does not replace what it could not read.
     * With `onlyIfListed` (the first read of a view, which has no file in most datasets) the file is asked for only
     * when the listing of its folder holds it, so the browser logs no 404 (FR-XC-10). A save reads without it: what it
     * merges into must be the file as the server holds it now.
     * @param {{ onlyIfListed?: boolean }} [options]
     * @returns {Promise<Object|null>} null when there is no file (or it is empty)
     * @throws {MeasurementFileError} when the file cannot be read or used: it is not touched, and a save
     *   stops there instead of replacing it with the view's measurements alone
     */
    async _read({ onlyIfListed = false } = {}) {
        if (onlyIfListed && !(await isListed(this.dataset, this.measurementPath))) return null;
        let content;
        try {
            content = await this.dataset.getFileContents(this.measurementPath);
        } catch (e) {
            if (isNotFound(e)) return null;
            throw new MeasurementFileError('unreadable', `The measurements file cannot be read: ${e && e.message ? e.message : e}`, { cause: e });
        }
        return parse(content, { pointCloudCrs: this.pointCloudCrs });
    }

    /**
     * Makes the file hold the given measurements of this view, next to those of the other view.
     * The file is removed when nothing is left in it. A file that cannot be read is not replaced.
     *
     * @param {Object} geojsonData - GeoJSON FeatureCollection of this view's measurements (the converter's
     *   document: its features and its section in `metadata.views`)
     * @returns {Promise<{path: string, fileName: string, count: number, deleted: boolean, owner: string}>}
     *   `count` measurements of this view are in the file; `deleted` when the file was removed.
     * @throws {MeasurementNotLoadedError} when the last read of the file is in flight or failed (nothing is written)
     * @throws {MeasurementNotPlacedError} when the view could not show some of the saved measurements (nothing is written)
     * @throws when the file cannot be read or written
     */
    async save(geojsonData) {
        const refusal = this.saveRefusal;
        if (refusal) throw refusal;
        return this._write(geojsonData);
    }

    /** Reads the file, merges the measurements of this view into it and writes it (or removes it). */
    async _write(geojsonData) {
        try {
            const previous = await this._read();
            const own = geojsonData.features || [];
            const document = write(previous, this.owner, own, sectionOf(geojsonData, this.owner));
            const result = { path: this.measurementPath, fileName: this._fileName(), count: own.length, owner: this.owner };
            if (!document.features.length) {
                await this._deleteIfPresent();
                this.loadState = 'loaded';
                this.unplaced = 0;
                return { ...result, deleted: true };
            }

            const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/geo+json' });
            // The measurement file of this view: merged above, replaced here
            await this.dataset.writeObj(this.measurementPath, blob, { overwrite: true });
            this.loadState = 'loaded';
            // What the view did not show is gone from the file (a delete; a save is refused while there is any)
            this.unplaced = 0;
            return { ...result, deleted: false };
        } catch (error) {
            console.error('Failed to save measurements:', error);
            throw new Error(`Failed to save measurements: ${error.message}`, { cause: error });
        }
    }

    /**
     * Removes this view's measurements from the file (the file goes when nothing is left). A user who asks for
     * this has chosen to lose them, so it is not refused after a failed read (it reads the file itself).
     * @returns {Promise<{path: string, fileName: string, count: number, deleted: boolean, owner: string}>}
     */
    deleteSaved() {
        return this._write({ type: 'FeatureCollection', features: [] });
    }

    /** Deletes the file; a file that is already gone is not an error. */
    async _deleteIfPresent() {
        try {
            await this.dataset.deleteObj(this.measurementPath);
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
    }

    /** Just the file name component of the storage path (for toasts). */
    _fileName() {
        return this.measurementPath ? pathutils.basename(this.measurementPath) : '';
    }

    /**
     * This view's saved measurements (with the file's metadata, and the view's own section).
     * @returns {Promise<Object|null>} GeoJSON, or null when the file has none of this view's
     * @throws {MeasurementFileError} when the file cannot be read or used (`loadState` is then 'failed' until a
     *   read succeeds: see saveRefusal)
     */
    async load() {
        const turn = ++this._loadTurn;
        this.loadState = 'pending';
        // The view shows what this read gives: it says again what it could not show
        this.unplaced = 0;
        let document;
        try {
            document = await this._read({ onlyIfListed: true });
        } catch (e) {
            // A newer read decides the state
            if (turn === this._loadTurn) this.loadState = 'failed';
            throw e;
        }
        if (turn === this._loadTurn) this.loadState = 'loaded';
        if (!document) return null;
        const features = document.features.filter(f => this._owns(f));
        if (!features.length) return null;
        const views = { [this.owner]: sectionOf(document, this.owner) };
        return { ...document, metadata: { ...document.metadata, views }, features };
    }

    /**
     * Export measurements as download: the 2.0 document of this view's measurements
     * @param {Object} geojsonData - GeoJSON FeatureCollection (see save)
     * @param {string} filename - Filename for download
     */
    exportToFile(geojsonData, filename = null) {
        const fname = filename || `measurements_${Date.now()}.geojson`;
        const document = write(null, this.owner, geojsonData.features || [], sectionOf(geojsonData, this.owner));
        downloadText(JSON.stringify(document, null, 2), fname, 'application/geo+json');

        console.log(`Measurements exported as: ${fname}`);
    }
}
