// @ts-check
/**
 * The piles that "Find all piles" found, drawn on the map before any of them is added as a measurement: every
 * outline with its row number, in a layer of its own (the measurements layer holds only what the user adds).
 *
 * An outline is drawn in the analysis yellow with a dark halo, as the piles on the map are. The chosen pile
 * is thicker and fuller, the one under the pointer in the list is as thick, and a pile that is already a
 * measurement is dimmed: it is on the map in the measurements layer, so its preview only keeps the place of its row.
 */
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Fill, Stroke, Style, Text } from 'ol/style';
import GeoJSON from 'ol/format/GeoJSON';
import { markRaw } from 'vue';
import { EPSG } from '@/libs/constants';
import { hexRgba } from '@/libs/palette';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';
import { haloStyle } from '@/libs/map/analysisStyles';

/** Above the pile on the map and below the shape being drawn */
const PREVIEW_Z_INDEX = 1500;

/** The text of a row number: dark on the yellow, which every map and every theme reads */
const LABEL_TEXT = '#1a1a1a';

/** How an outline looks in each state: the line width and the opacity of the line, of the fill and of the number */
const LOOK = Object.freeze({
    normal: { width: 2, line: 0.9, fill: 0.12, label: 0.9 },
    emphasised: { width: 4, line: 1, fill: 0.35, label: 1 },
    added: { width: 1.5, line: 0.45, fill: 0, label: 0.5 }
});

/**
 * The styles of one outline: its halo, its line and its fill, and its row number at its centre.
 * @param {keyof typeof LOOK} look
 * @param {number} rank  the number of its row (1 for the first)
 */
function outlineStyles(look, rank) {
    const { width, line, fill, label } = LOOK[look];
    return [
        haloStyle(width, undefined),
        new Style({
            stroke: new Stroke({ color: hexRgba(ANALYSIS_COLOR, line), width }),
            fill: new Fill({ color: hexRgba(ANALYSIS_COLOR, fill || 0.01) })
        }),
        new Style({
            geometry: feature => {
                const geometry = /** @type {import('ol/geom').Polygon} */ (feature.getGeometry());
                return new Point(geometry.getInteriorPoint().getCoordinates());
            },
            text: new Text({
                text: String(rank),
                font: 'bold 12px sans-serif',
                fill: new Fill({ color: LABEL_TEXT }),
                backgroundFill: new Fill({ color: hexRgba(ANALYSIS_COLOR, label) }),
                padding: [1, 4, 1, 4]
            })
        })
    ];
}

/**
 * The preview layer and the state its styles follow. Nothing is on the map until `attach`.
 * @returns {{
 *   layer: VectorLayer<VectorSource>,
 *   show: (piles: Array<{ id: number, polygon: Record<string, any> }>, mapProjection: import('ol/proj').ProjectionLike) => void,
 *   clear: () => void,
 *   setChosen: (id: number|null) => void,
 *   setHovered: (id: number|null) => void,
 *   setAdded: (ids: Iterable<number>) => void,
 *   setOutline: (id: number, polygon: object, mapProjection: any) => void,
 *   pileAt: (map: import('ol/Map').default, pixel: number[]) => number|null,
 *   fit: (map: import('ol/Map').default, id: number) => void
 * }}
 */
/**
 * Bring a pile into view: its outline with a margin, at most at the zoom of a few centimetres a pixel. A map that has
 * no size (not laid out yet) is left alone.
 * @param {import('ol/Map').default} map
 * @param {import('ol/geom').Geometry|undefined|null} geometry  in the projection of the map
 */
export function fitPile(map, geometry) {
    if (!map || !geometry || !map.getSize()) return;
    map.getView().fit(/** @type {any} */ (geometry), { padding: [60, 60, 60, 60], maxZoom: 21, duration: 250 });
}

export function createPilePreview() {
    const source = new VectorSource();
    /** @type {{ chosen: number|null, hovered: number|null, added: Set<number> }} */
    const state = { chosen: null, hovered: null, added: new Set() };

    /** @param {import('ol/Feature').default} feature */
    const lookOf = feature => {
        const id = feature.get('pileId');
        if (id === state.chosen || id === state.hovered) return 'emphasised';
        return state.added.has(id) ? 'added' : 'normal';
    };
    const layer = new VectorLayer({
        source,
        zIndex: PREVIEW_Z_INDEX,
        // Re-styled by `changed()`: the state is not a property of the features
        style: feature => outlineStyles(lookOf(/** @type {import('ol/Feature').default} */ (feature)), feature.get('rank'))
    });

    /** @param {number|null} id @param {'chosen'|'hovered'} key */
    const set = (id, key) => {
        if (state[key] === id) return;
        state[key] = id;
        layer.changed();
    };
    /** @param {number} id */
    const featureOf = id => source.getFeatures().find(f => f.get('pileId') === id) ?? null;

    return markRaw({
        layer,
        show(piles, mapProjection) {
            const format = new GeoJSON();
            source.clear();
            piles.forEach((pile, index) => {
                const geometry = format.readGeometry(pile.polygon, { dataProjection: EPSG.WGS84, featureProjection: mapProjection });
                const feature = new Feature({ geometry });
                feature.set('pileId', pile.id);
                feature.set('rank', index + 1);
                source.addFeature(feature);
            });
        },
        clear() {
            source.clear();
            state.chosen = null;
            state.hovered = null;
            state.added = new Set();
        },
        setChosen: id => set(id, 'chosen'),
        setHovered: id => set(id, 'hovered'),
        setAdded(ids) {
            state.added = new Set(ids);
            layer.changed();
        },
        // The outline of a pile that is a measurement follows the measurement (its outline edited)
        setOutline(id, polygon, mapProjection) {
            const feature = featureOf(id);
            if (!feature || !polygon) return;
            feature.setGeometry(new GeoJSON().readGeometry(polygon, { dataProjection: EPSG.WGS84, featureProjection: mapProjection }));
        },
        pileAt(map, pixel) {
            const hit = map.forEachFeatureAtPixel(pixel, feature => feature, {
                layerFilter: candidate => candidate === layer, hitTolerance: 4
            });
            const id = hit && /** @type {import('ol/Feature').default} */ (hit).get('pileId');
            return typeof id === 'number' ? id : null;
        },
        fit(map, id) {
            fitPile(map, featureOf(id)?.getGeometry());
        }
    });
}
