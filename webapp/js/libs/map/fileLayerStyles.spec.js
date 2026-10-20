import { describe, it, expect } from 'vitest';
import { createFileLayerStyles, FILE_COLORS } from './fileLayerStyles';

const shot = (selected, props) => ({ style: 'direction', file: { selected, entry: { properties: props } } });
const cluster = feats => ({ get: () => feats });

describe('createFileLayerStyles', () => {
    it('memoizes shot styles per cluster size and selection', () => {
        const styles = createFileLayerStyles();
        const a = styles.shot([shot(false), shot(false)]);
        expect(styles.shot([shot(false), shot(false)])).toBe(a);
        const sel = styles.shot([shot(true), shot(false)]);
        expect(sel).not.toBe(a);
        expect(sel.getImage().getFill().getColor()).toBe(FILE_COLORS.shotSelected);
        expect(a.getText().getText()).toBe('2');
    });

    it('draws an arrow only for a single shot with a camera orientation', () => {
        const styles = createFileLayerStyles();
        const oriented = styles.forCluster(cluster([shot(false, { hasCameraOrientation: true, cameraYaw: 90 })]));
        expect(oriented.getImage().getRotation()).toBeCloseTo(Math.PI / 2);
        const plain = styles.forCluster(cluster([shot(false, {})]));
        expect(plain).toBe(styles.shot([shot(false, {})]));
    });

    it('resolves fixed styles by the feature style key', () => {
        const styles = createFileLayerStyles();
        expect(styles.forCluster(cluster([{ style: 'pano', file: { selected: true } }]))).toBe(styles.panoSelected);
    });
});
