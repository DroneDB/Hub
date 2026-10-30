import { describe, it, expect } from 'vitest';
import { createLocationStyles } from './locationStyles';
import { FILE_COLORS } from './fileLayerStyles';

const pin = colour => ({ get: key => (key === 'colour' ? colour : undefined) });
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
});
