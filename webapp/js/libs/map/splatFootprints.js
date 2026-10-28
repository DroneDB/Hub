// @ts-check
/**
 * The footprints of georeferenced Gaussian splats on the dataset map. At index time a splat has
 * only a point (the origin of its local frame); once it is built, its `bounds.json` may carry
 * `wgs84Footprint`, the ground it covers as a GeoJSON polygon. The map draws the point at first
 * and swaps it for the polygon when the footprint is known. A splat with no georeference is not
 * drawn: it has no place.
 *
 * The footprint is read lazily: only for the splats in view, and once per build (the URL of the
 * bounds artifact names the build) and file list, including a build whose bounds have none, so a
 * pan does not ask again. A read that fails (a server error, a dropped connection) is not kept:
 * the point stays and the next move of the map asks again. A new file list reads again, because
 * a splat built again keeps the URL of its bounds (the hash of the file) and an older build may
 * have had no footprint. A splat whose build is not finished lists no bounds artifact and nothing
 * is requested.
 *
 *   const splats = new SplatFootprints();
 *   splats.setFiles(files);                      // when the files on show change
 *   await splats.loadInView(extent, dataset);    // when the map moves
 */
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { createEmpty as createEmptyExtent, intersects } from 'ol/extent';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import ddb from 'ddb';
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';
import { EPSG } from '@/libs/constants';
import { FILE_COLORS } from '@/libs/map/fileLayerStyles';
import { primaryRgba } from '@/libs/palette';

const geoJson = new GeoJSON();

/** A GeoJSON geometry in Web Mercator. @param {any} geometry */
const toMercator = geometry => geoJson.readGeometry(geometry, { dataProjection: EPSG.WGS84, featureProjection: EPSG.WEB_MERCATOR });

/** @param {unknown} v */
const isLonLat = v => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])
    && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;

/**
 * Whether a file of the map is a Gaussian splat with a place on the Earth: georeferenced and with
 * the point the indexer wrote.
 * @param {any} file  an explorer item
 */
export function isGeoreferencedSplat(file) {
    const entry = file?.entry;
    return entry?.type === ddb.entry.type.GAUSSIAN_SPLAT && entry.properties?.georeferenced === true
        && entry.point_geom?.type === 'Point' && isLonLat(entry.point_geom.coordinates);
}

/**
 * The footprint of a build as a GeoJSON polygon, from its bounds: the `wgs84Footprint` when it is
 * a polygon with a closed ring of at least four longitude/latitude positions, else null (the
 * caller keeps the point).
 * @param {any} bounds  the parsed bounds.json
 * @returns {{ type: 'Polygon', coordinates: number[][][] } | null}
 */
export function footprintOf(bounds) {
    const footprint = bounds?.wgs84Footprint;
    if (footprint?.type !== 'Polygon' || !Array.isArray(footprint.coordinates)) return null;
    const ring = footprint.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isLonLat)) return null;
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) return null;
    return footprint;
}

/** The styles of the splats: the polygon, and the point it is until the footprint is known. */
function createStyles() {
    const point = new Style({
        image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: primaryRgba(0.35, 300) }),
            stroke: new Stroke({ color: FILE_COLORS.shot, width: 3 })
        })
    });
    const polygon = new Style({
        fill: new Fill({ color: primaryRgba(0.2, 300) }),
        stroke: new Stroke({ color: FILE_COLORS.shot, width: 2 })
    });
    return { point, polygon };
}

export class SplatFootprints {
    constructor() {
        const styles = createStyles();
        this.source = new VectorSource();
        this.layer = new VectorLayer({
            source: this.source,
            style: feature => (feature.getGeometry()?.getType() === 'Point' ? styles.point : styles.polygon)
        });
        /** The feature of each splat on show. @type {Map<any, Feature>} */
        this.features = new Map();
        /**
         * What a build's bounds gave, by the URL of the bounds artifact: `{ footprint }` (null when
         * the bounds have none), or null while the bounds could not be read (not kept).
         * @type {Map<string, Promise<{ footprint: any } | null>>}
         */
        this.footprints = new Map();
    }

    /**
     * Shows these files: a point for each georeferenced splat among them. The footprints read for
     * the files before are forgotten, so a splat built again since gets the bounds of its new build.
     * @param {any[]} files
     */
    setFiles(files) {
        this.source.clear();
        this.features.clear();
        this.footprints.clear();
        const features = [];
        for (const file of files) {
            if (!isGeoreferencedSplat(file)) continue;
            const feature = new Feature(toMercator(file.entry.point_geom));
            /** @type {any} */ (feature).file = file;
            this.features.set(file, feature);
            features.push(feature);
        }
        if (features.length) this.source.addFeatures(features);
    }

    /**
     * Replaces the point of every splat in view with its footprint, when the build has one.
     * Resolves when every read started by the call is done.
     * @param {number[]} extent  the view, in Web Mercator
     * @param {{ Entry: (entry: any) => any } | null | undefined} dataset
     */
    async loadInView(extent, dataset) {
        if (!dataset) return;
        const loads = [];
        for (const [file, feature] of this.features) {
            const geometry = feature.getGeometry();
            if (geometry && intersects(extent, geometry.getExtent())) loads.push(this.load(file, feature, dataset));
        }
        await Promise.all(loads);
    }

    /** @param {any} file @param {Feature} feature @param {{ Entry: (entry: any) => any }} dataset */
    async load(file, feature, dataset) {
        const entry = dataset.Entry(file.entry);
        const url = entry.findArtifact(ArtifactRole.GSPLAT_BOUNDS);
        // Not built yet: the point stays and a later look may find the bounds
        if (!url || feature.get('footprintOf') === url) return;

        let read = this.footprints.get(url);
        if (!read) {
            // getGsplatBounds gives null for bounds it could not read (and does not throw, but nothing relies on it)
            read = Promise.resolve(entry.getGsplatBounds())
                .then(bounds => (bounds ? { footprint: footprintOf(bounds) } : null), () => null);
            this.footprints.set(url, read);
        }
        const result = await read;
        // A failed read may be a passing one: forgotten, so the next look asks again
        if (!result && this.footprints.get(url) === read) this.footprints.delete(url);
        // The files on show changed while it was read
        if (this.features.get(file) !== feature || !result) return;
        feature.set('footprintOf', url);
        if (result.footprint) feature.setGeometry(toMercator(result.footprint));
    }

    /** The extent of everything drawn (EPSG:3857), empty when nothing is. */
    extent() {
        return this.features.size ? this.source.getExtent() : createEmptyExtent();
    }
}
