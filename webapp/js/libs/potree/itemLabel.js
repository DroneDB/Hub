// @ts-check
/**
 * The label of a measure in the point cloud viewer: what names the item, on up to three lines - its name (bold), its
 * category and severity (with the colour of the severity as a dot), and the first line of its description - drawn on
 * one sprite. A point labelled this way shows the label instead of its coordinates; an item with none of the three
 * keeps the labels Potree gives it.
 *
 * The sprite is a Potree.TextSprite whose texture is drawn here: Potree bundles its own three.js, and only objects
 * made from its classes are safe in its scene.
 */
import { choiceLabel } from '@/libs/map/annotationIds';

/** The most characters a line shows; a longer one ends with an ellipsis (the tooltip has the whole description). */
export const LABEL_LIMITS = Object.freeze({ name: 48, fields: 48, description: 64 });

/** CSS px of the label's text and box (the sprite is drawn at the screen's pixel ratio). */
const STYLE = Object.freeze({
    nameFont: 16, font: 13, lineGap: 3, padX: 8, padY: 6, radius: 6, dot: 8,
    background: 'rgba(0, 0, 0, 0.75)', text: '#ffffff', muted: '#d4d4d4', fontFace: 'Arial'
});

/**
 * @typedef {{ text: string, kind: 'name' | 'fields' | 'description', colour?: string }} LabelLine
 */

/** The text shortened to `max` characters, with an ellipsis when it was longer. */
export function clipText(text, max) {
    const value = String(text ?? '').replace(/\s+/g, ' ').trim();
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * The lines of the label of an item: its name, "Category · Severity" (with the severity's colour) and the first line of
 * its description, each only when it has one. None: the item has no label of its own.
 * @param {{ name?: string, description?: string, category?: string, severity?: string }} item  the name and the description as text
 * @param {{ categories?: any[], severities?: any[] }} [schema]  the organization's choices (an unknown id is shown as such)
 * @returns {LabelLine[]}
 */
export function itemLabelLines(item, schema) {
    const lines = /** @type {LabelLine[]} */ ([]);
    const name = clipText(item.name, LABEL_LIMITS.name);
    if (name) lines.push({ text: name, kind: 'name' });

    const fields = clipText([choiceLabel(schema?.categories, item.category), choiceLabel(schema?.severities, item.severity)]
        .filter(Boolean).join(' · '), LABEL_LIMITS.fields);
    if (fields) {
        const colour = item.severity ? (schema?.severities || []).find(s => s.id === item.severity)?.colour : undefined;
        lines.push(colour ? { text: fields, kind: 'fields', colour } : { text: fields, kind: 'fields' });
    }

    const description = clipText(String(item.description ?? '').split(/\r?\n/).find(line => line.trim()) || '', LABEL_LIMITS.description);
    if (description) lines.push({ text: description, kind: 'description' });
    return lines;
}

const fontOf = (/** @type {LabelLine} */ line) => (line.kind === 'name'
    ? `bold ${STYLE.nameFont}px ${STYLE.fontFace}`
    : `${line.kind === 'description' ? 'italic ' : ''}${STYLE.font}px ${STYLE.fontFace}`);
const heightOf = (/** @type {LabelLine} */ line) => Math.round((line.kind === 'name' ? STYLE.nameFont : STYLE.font) * 1.3);

/**
 * Draws the lines on a canvas: a dark rounded box, the text left aligned.
 * @param {LabelLine[]} lines
 * @param {number} [ratio]  device pixels per CSS px of the canvas
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number }}  the canvas, and its size in CSS px
 */
export function drawItemLabel(lines, ratio = 1) {
    const canvas = document.createElement('canvas');
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const indent = line => (line.colour ? STYLE.dot + 5 : 0);
    const textWidth = Math.max(1, ...lines.map(line => {
        ctx.font = fontOf(line);
        return ctx.measureText(line.text).width + indent(line);
    }));
    const width = Math.ceil(textWidth + 2 * STYLE.padX);
    const height = Math.ceil(lines.reduce((sum, line) => sum + heightOf(line), 0) + STYLE.lineGap * Math.max(0, lines.length - 1) + 2 * STYLE.padY);

    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = STYLE.background;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, width, height, STYLE.radius);
    else ctx.rect(0, 0, width, height);
    ctx.fill();

    ctx.textBaseline = 'middle';
    let y = STYLE.padY;
    for (const line of lines) {
        const middle = y + heightOf(line) / 2;
        if (line.colour) {
            ctx.fillStyle = line.colour;
            ctx.beginPath();
            ctx.arc(STYLE.padX + STYLE.dot / 2, middle, STYLE.dot / 2, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.font = fontOf(line);
        ctx.fillStyle = line.kind === 'name' ? STYLE.text : STYLE.muted;
        ctx.fillText(line.text, STYLE.padX + indent(line), middle);
        y += heightOf(line) + STYLE.lineGap;
    }
    return { canvas, width, height };
}

const classes = new WeakMap();

/**
 * The class of the label sprite for this Potree: a TextSprite that draws lines (setLines) instead of one text. Its
 * sprite is scaled as Potree scales its own labels (0.01 a CSS px), so that the same screen-size rule fits both.
 * @param {any} Potree  the global Potree
 */
export function itemLabelClass(Potree) {
    let ItemLabel = classes.get(Potree);
    if (ItemLabel) return ItemLabel;
    ItemLabel = class extends Potree.TextSprite {
        /** @param {LabelLine[]} lines */
        setLines(lines) {
            this.lines = lines;
            this.update();
        }

        update() {
            // The TextSprite's constructor draws its (empty) text before there are lines
            if (!this.lines) return;
            const { canvas, width, height } = drawItemLabel(this.lines, Potree.TextSprite.resolutionScale || 1);
            const previous = this.texture;
            const texture = new previous.constructor(canvas);
            texture.minFilter = previous.minFilter;
            texture.magFilter = previous.magFilter;
            texture.needsUpdate = true;
            previous.dispose?.();
            this.sprite.material.map = texture;
            this.texture = texture;
            this.sprite.scale.set(width * 0.01, height * 0.01, 1);
        }

        dispose() {
            this.texture?.dispose?.();
            this.sprite.material.dispose?.();
        }
    };
    classes.set(Potree, ItemLabel);
    return ItemLabel;
}
