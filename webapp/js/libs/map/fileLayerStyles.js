// @ts-check
/**
 * OpenLayers styles of the dataset map's file layers (HQ-07, out of Map.vue loadMap):
 * camera shots and their clusters, direction arrows, panoramas, the flight path and its
 * flags, and the invisible raster extents (vector files are styled by useMvtLayer).
 * Generated styles are memoized on the returned object: one `createFileLayerStyles()` per map.
 */
import { Circle as CircleStyle, Fill, Stroke, Style, Text, Icon } from 'ol/style';
import { isMobile } from '@/libs/responsive';

/** File-layer colours (one place; the measurement accent lives in CSS --ddb-measure-color). */
export const FILE_COLORS = {
    shot: 'rgba(75, 150, 243, 1)',
    shotSelected: 'rgba(255, 158, 103, 1)',
    halo: 'rgba(252, 252, 255, 1)'
};

/**
 * @param {string} fill
 * @param {string} stroke
 * @param {number} size  features in the cluster (a count is drawn above 1)
 */
function shotStyle(fill, stroke, size) {
    const text = size > 1
        ? new Text({ text: size.toString(), font: 'bold 1rem sans-serif', fill: new Fill({ color: FILE_COLORS.halo }) })
        : undefined;
    return new Style({
        image: new CircleStyle({
            radius: isMobile() ? 10 : 8,
            fill: new Fill({ color: fill }),
            stroke: new Stroke({ color: stroke, width: 2 })
        }),
        text
    });
}

/** @param {string} svgName @param {number} yawDegrees */
function directionStyle(svgName, yawDegrees) {
    return new Style({
        image: new Icon({
            src: `/images/${svgName}`,
            rotation: yawDegrees * (Math.PI / 180),
            rotateWithView: false,
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: isMobile() ? 1.2 : 1.0
        })
    });
}

/** @param {string} src @param {number[]} anchor */
function iconStyle(src, anchor) {
    return new Style({ image: new Icon({ anchor, anchorXUnits: 'fraction', anchorYUnits: 'fraction', src }) });
}

/** @param {any[]} feats */
const anySelected = feats => feats.some(f => f.file && f.file.selected);

/**
 * The style table. Function entries take the cluster's features; `forCluster` picks the
 * entry named by the first feature's `style` key (the file layer's style function).
 * @returns {Record<string, any>}
 */
export function createFileLayerStyles() {
    /** @type {Record<string, any>} */
    const styles = {};
    /** @param {string} id @param {() => Style} make */
    const memo = (id, make) => styles[id] || (styles[id] = make());

    /** Camera arrow when the shot has an orientation, else the shot dot. @param {any[]} feats */
    const arrow = feats => {
        if (feats.length > 1) return styles.shot(feats);
        const feat = feats[0];
        const props = feat.file?.entry?.properties;
        if (!props?.hasCameraOrientation) return styles.shot(feats);
        const yaw = props.cameraYaw ?? 0;
        const selected = feat.file?.selected;
        return memo(`_direction-${selected ? 'sel' : 'def'}-${Math.round(yaw)}`,
            () => directionStyle(selected ? 'direction-arrow-selected.svg' : 'direction-arrow.svg', yaw));
    };

    Object.assign(styles, {
        shot: feats => anySelected(feats)
            ? memo(`_shot-selected-${feats.length}`, () => shotStyle(FILE_COLORS.shotSelected, FILE_COLORS.halo, feats.length))
            : memo(`_shot-${feats.length}`, () => shotStyle(FILE_COLORS.shot, FILE_COLORS.halo, feats.length)),
        direction: arrow,
        pano: feats => anySelected(feats) ? styles.panoSelected : styles.panoDeselected,

        invisible: new Style({ fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }) }),
        startFlag: iconStyle('/images/start-flag.svg', [0.05, 1]),
        finishFlag: iconStyle('/images/finish-flag.svg', [0.05, 1]),
        flightPath: new Style({ stroke: new Stroke({ color: FILE_COLORS.shot, width: 4 }) }),
        panoDeselected: iconStyle('/images/pano.svg', [0.5, 0.5]),
        panoSelected: iconStyle('/images/pano-selected.svg', [0.5, 0.5])
    });

    /** Style function of the clustered file layer. @param {any} cluster */
    styles.forCluster = cluster => {
        const feats = cluster.get('features');
        const s = styles[feats[0].style];
        return typeof s === 'function' ? s(feats) : s;
    };
    return styles;
}
