// @ts-check
/**
 * OpenLayers styles of the dataset overview map: the pins and their clusters (the marker of the
 * dataset map's camera shots, in the colour of the organization when several are shown) and the
 * box of the dataset under the pointer or the open popup, and the names of the datasets under
 * the pins when the user shows them.
 * Generated styles are memoized: one `createLocationStyles()` per map.
 */
import { Fill, Stroke, Style, Text } from 'ol/style';
import { FILE_COLORS, clusterStyle } from '@/libs/map/fileLayerStyles';
import { isMobile } from '@/libs/responsive';

// A cluster names this many of its datasets; the label says how many more it holds
const NAMED_IN_CLUSTER = 3;

/**
 * The label under a pin: the name of its dataset, or for a cluster the names of its first
 * datasets, one per line, and how many more it holds.
 * @param {string[]} names
 * @returns {string}
 */
export function clusterLabel(names) {
    if (names.length <= NAMED_IN_CLUSTER) return names.join('\n');
    const shown = NAMED_IN_CLUSTER - 1;
    return [...names.slice(0, shown), `+${names.length - shown} more`].join('\n');
}

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
        },

        /** Style function of the label layer (the same clusters as the pins). @param {any} cluster */
        label: cluster => {
            const text = clusterLabel(cluster.get('features').map(pin => pin.get('name')));
            return remember(`label|${text}`, () => new Style({
                text: new Text({
                    text,
                    font: '600 0.75rem sans-serif',
                    textBaseline: 'top',
                    // Below the pin (its radius and stroke) with a small gap
                    offsetY: isMobile() ? 15 : 13,
                    fill: new Fill({ color: '#1a1a2e' }),
                    backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.92)' }),
                    backgroundStroke: new Stroke({ color: 'rgba(0, 0, 0, 0.15)', width: 1 }),
                    padding: [2, 5, 1, 5]
                })
            }));
        }
    };
}
