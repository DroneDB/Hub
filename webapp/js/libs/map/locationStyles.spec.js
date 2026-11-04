import { describe, it, expect } from 'vitest';
import { clusterLabel, createLocationStyles } from './locationStyles';
import { FILE_COLORS } from './fileLayerStyles';

const pin = (colour, name) => ({ get: key => ({ colour, name })[key] });
const cluster = (...pins) => ({ get: () => pins });
const fill = style => style.getImage().getFill().getColor();

describe('location styles', () => {
    it('draws the pins in the colour of the dataset map when one organization is shown', () => {
        const styles = createLocationStyles({ coloured: () => false });
        expect(fill(styles.pin(cluster(pin('red'))))).toBe(FILE_COLORS.shot);
    });

    it('draws a pin in the colour of its organization when several are shown', () => {
        const styles = createLocationStyles({ coloured: () => true });
        expect(fill(styles.pin(cluster(pin('red'))))).toBe('red');
        expect(fill(styles.pin(cluster(pin('red'), pin('red'))))).toBe('red');
    });

    it('draws a cluster of several organizations in the colour of the dataset map, with its count', () => {
        const styles = createLocationStyles({ coloured: () => true });
        const style = styles.pin(cluster(pin('red'), pin('blue'), pin('red')));
        expect(fill(style)).toBe(FILE_COLORS.shot);
        expect(style.getText().getText()).toBe('3');
        expect(styles.pin(cluster(pin('red'))).getText()).toBeNull();
    });

    it('reuses a style it made', () => {
        const styles = createLocationStyles({ coloured: () => true });
        expect(styles.pin(cluster(pin('red'), pin('red')))).toBe(styles.pin(cluster(pin('red'), pin('red'))));
        expect(styles.box(pin('red'))).toBe(styles.box(pin('red')));
    });

    it('outlines a box in the colour of its organization when several are shown', () => {
        expect(createLocationStyles({ coloured: () => true }).box(pin('red')).getStroke().getColor()).toBe('red');
        expect(createLocationStyles().box(pin('red')).getStroke().getColor()).toBe(FILE_COLORS.shot);
    });

    it('labels a pin with the name of its dataset, and a cluster with the names of its first ones', () => {
        const styles = createLocationStyles();
        expect(styles.label(cluster(pin('red', 'Roof'))).getText().getText()).toBe('Roof');
        expect(styles.label(cluster(pin('red', 'A'), pin('red', 'B'))).getText().getText()).toBe('A\nB');
        expect(styles.label(cluster(pin('red', 'A'), pin('red', 'B')))).toBe(styles.label(cluster(pin('blue', 'A'), pin('blue', 'B'))));
    });
});

describe('clusterLabel', () => {
    it('names up to three datasets, and says how many more there are beyond', () => {
        expect(clusterLabel(['A'])).toBe('A');
        expect(clusterLabel(['A', 'B', 'C'])).toBe('A\nB\nC');
        expect(clusterLabel(['A', 'B', 'C', 'D'])).toBe('A\nB\n+2 more');
        expect(clusterLabel(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A\nB\n+4 more');
    });
});
