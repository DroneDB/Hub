// @ts-check
/**
 * OpenLayers styles of the dataset overview map: the pins and their clusters (the marker of the
 * dataset map's camera shots, in the colour of the organization when several are shown) and the
 * box of the dataset under the pointer or the open popup.
 * Generated styles are memoized: one `createLocationStyles()` per map.
 */
import { Fill, Stroke, Style } from 'ol/style';
import { FILE_COLORS, clusterStyle } from '@/libs/map/fileLayerStyles';

/**
 * @param {object} [options]
 * @param {() => boolean} [options.coloured]  whether the pins take the colour of their organization
 *   (several organizations are shown); else they are the brand blue of the dataset map
 */
export function createLocationStyles({ coloured = () => false } = {}) {
    /** @type {Map<string, Style>} */
    const memo = new Map();
    /** @param {string} id @param {() => Style} make */
    const remember = (id, make) => {
        let style = memo.get(id);
        if (!style) memo.set(id, style = make());
        return style;
    };

    /** The colour a cluster is drawn in: its organization's when all its pins share one. @param {any[]} pins */
    const clusterColour = pins => {
        if (!coloured()) return FILE_COLORS.shot;
        const first = pins[0].get('colour');
        return first && pins.every(pin => pin.get('colour') === first) ? first : FILE_COLORS.shot;
    };

    return {
        /** Style function of the clustered layer. @param {any} cluster */
        pin: cluster => {
            const pins = cluster.get('features');
            const colour = clusterColour(pins);
            return remember(`${colour}|${pins.length}`, () => clusterStyle(colour, FILE_COLORS.halo, pins.length));
        },

        /** Style function of the box layer. @param {any} box */
        box: box => {
            const colour = coloured() ? box.get('colour') || FILE_COLORS.shot : FILE_COLORS.shot;
            return remember(`box|${colour}`, () => new Style({
                stroke: new Stroke({ color: colour, width: 3 }),
                fill: new Fill({ color: 'rgba(255, 255, 255, 0.15)' })
            }));
        }
    };
}
