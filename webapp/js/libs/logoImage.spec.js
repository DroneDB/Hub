/**
 * logoImage: how a logo file is prepared in the browser. The browser (decode, draw, encode) is replaced by fakes whose
 * encoded size follows the size and the quality asked for, so the decisions are tested: the size of the result and
 * no upscaling, WebP or PNG, the ladder of qualities and sizes, the original kept when it is already the smallest, the limit
 * on what is read, and an SVG kept or drawn.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    LOGO_MAX_INPUT_BYTES, LOGO_QUALITIES, LogoProblem, describeLogo, edgeLadder, minifySvg, prepareLogo, svgSize
} from './logoImage';

const MAX = 256 * 1024;

/** A file of `size` bytes whose content is not read. */
const fileOf = (name, type, size) => {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
};

/**
 * The browser as a fake: images of `width` x `height`; `bytes({ width, height, quality, type })` is the size of what it encodes.
 * `canWebp` false is a browser that answers PNG whatever it is asked.
 */
function fakePorts({ width = 2000, height = 1000, bytes = () => 1000, canWebp = true, svg = { width: 0, height: 0 } } = {}) {
    const release = vi.fn();
    const ports = {
        decode: vi.fn(async () => ({ width, height, source: 'bitmap', release })),
        decodeSvg: vi.fn(async () => ({ width: svg.width, height: svg.height, source: 'svg', release })),
        render: vi.fn(async (image, w, h, type, quality) => {
            const answered = canWebp ? type : 'image/png';
            return new Blob([new Uint8Array(bytes({ width: w, height: h, quality, type: answered }))], { type: answered });
        })
    };
    return { ports, release };
}
const renderedAt = ports => ports.render.mock.calls.map(([, w, h, , quality]) => [w, h, quality]);


describe('edgeLadder', () => {
    it('steps down by a quarter while the side stays at 128 pixels or more', () => {
        expect(edgeLadder(512)).toEqual([512, 384, 288, 216, 162]);
    });

    it('is only the start for an image already below the floor', () => {
        expect(edgeLadder(100)).toEqual([100]);
        expect(edgeLadder(128)).toEqual([128]);
    });
});

describe('minifySvg and svgSize', () => {
    it('drops the declaration, doctype, comments, metadata and the line breaks between tags, and keeps text', () => {
        const svg = '\uFEFF<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<!-- made by a tool -->\n<svg viewBox="0 0 10 5">\n  <metadata>\n    <x/>\n  </metadata>\n  <text>a  b</text>\n</svg>\n';
        expect(minifySvg(svg)).toBe('<svg viewBox="0 0 10 5"><text>a  b</text></svg>');
    });

    it('reads the size of the SVG from width and height, else from the viewBox, else none', () => {
        expect(svgSize('<svg width="120px" height="40" viewBox="0 0 1 1"></svg>')).toEqual({ width: 120, height: 40 });
        expect(svgSize('<svg viewBox="0 0 24 12"></svg>')).toEqual({ width: 24, height: 12 });
        expect(svgSize('<svg width="100%" height="50%" viewBox="0, 0, 8, 4"></svg>')).toEqual({ width: 8, height: 4 });
        expect(svgSize('<svg></svg>')).toBeNull();
        expect(svgSize('not svg')).toBeNull();
    });
});

describe('prepareLogo: a raster', () => {
    it('draws a large image at 512 pixels as WebP at quality 0.9, and names the file', async () => {
        const { ports, release } = fakePorts({ width: 2000, height: 1000 });
        const logo = await prepareLogo(fileOf('photo.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports });
        expect(renderedAt(ports)).toEqual([[512, 256, 0.9]]);
        expect(ports.render.mock.calls[0][3]).toBe('image/webp');
        expect(logo).toMatchObject({ type: 'image/webp', width: 512, height: 256, bytes: 1000, kept: false });
        expect(logo.file).toBeInstanceOf(File);
        expect(logo.file.name).toBe('logo.webp');
        expect(logo.file.type).toBe('image/webp');
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('does not make a small image larger', async () => {
        const { ports } = fakePorts({ width: 300, height: 100 });
        const logo = await prepareLogo(fileOf('small.gif', 'image/gif', 90_000), { maxBytes: MAX, ports });
        expect(renderedAt(ports)).toEqual([[300, 100, 0.9]]);
        expect(logo).toMatchObject({ width: 300, height: 100 });
    });

    it.each(['image/gif', 'image/bmp', 'image/avif'])('accepts %s whatever the browser decodes', async type => {
        const { ports } = fakePorts({ width: 100, height: 100 });
        const logo = await prepareLogo(fileOf('a', type, 1000), { maxBytes: MAX, ports });
        expect(logo.type).toBe('image/webp');
    });

    it('gives a PNG where the browser cannot make WebP, and does not try other qualities of it', async () => {
        const { ports } = fakePorts({ canWebp: false });
        const logo = await prepareLogo(fileOf('photo.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports });
        expect(logo).toMatchObject({ type: 'image/png', kept: false });
        expect(logo.file.name).toBe('logo.png');

        const { ports: big } = fakePorts({ canWebp: false, bytes: ({ width }) => (width > 300 ? MAX + 1 : 1000) });
        await prepareLogo(fileOf('photo.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports: big });
        // One try at each size, no steps of quality
        expect(renderedAt(big).map(([w, , q]) => [w, q])).toEqual([[512, 0.9], [384, 0.9], [288, 0.9]]);
    });

    it('lowers the quality before the size', async () => {
        const { ports } = fakePorts({ bytes: ({ quality }) => (quality > 0.75 ? MAX + 1 : 1000) });
        const logo = await prepareLogo(fileOf('p.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports });
        expect(renderedAt(ports)).toEqual([[512, 256, 0.9], [512, 256, 0.8], [512, 256, 0.7]]);
        expect(logo.width).toBe(512);
    });

    it('goes to a smaller size, at the first quality again, when the lowest quality is still too big', async () => {
        const { ports } = fakePorts({ bytes: ({ width }) => (width > 400 ? MAX + 1 : 1000) });
        const logo = await prepareLogo(fileOf('p.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports });
        expect(renderedAt(ports)).toEqual([
            ...LOGO_QUALITIES.map(q => [512, 256, q]),
            [384, 192, 0.9]
        ]);
        expect(logo).toMatchObject({ width: 384, height: 192 });
    });

    it('refuses an image that does not fit at the smallest size either, after trying every size and quality', async () => {
        const { ports, release } = fakePorts({ bytes: () => MAX + 1 });
        await expect(prepareLogo(fileOf('p.jpg', 'image/jpeg', 3_000_000), { maxBytes: MAX, ports }))
            .rejects.toThrow(/does not fit in 256 KB/);
        expect(ports.render).toHaveBeenCalledTimes(edgeLadderLength() * LOGO_QUALITIES.length);
        expect(release).toHaveBeenCalledTimes(1);
        expect(Math.min(...renderedAt(ports).map(([w, h]) => Math.max(w, h)))).toBeGreaterThanOrEqual(128);

        function edgeLadderLength() { return edgeLadder(512).length; }
    });

    it('keeps the original PNG, JPEG or WebP when it is within the size, within the limit and smaller than the result', async () => {
        for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
            const { ports } = fakePorts({ width: 300, height: 100, bytes: () => 5000 });
            const original = fileOf('logo.x', type, 2000);
            const logo = await prepareLogo(original, { maxBytes: MAX, ports });
            expect(logo.file).toBe(original);
            expect(logo).toMatchObject({ type, width: 300, height: 100, bytes: 2000, kept: true });
        }
    });

    it('draws it again when the result is the smaller, or the original is of another type or larger than the limit', async () => {
        const smaller = fakePorts({ width: 300, height: 100, bytes: () => 1000 });
        expect((await prepareLogo(fileOf('l.png', 'image/png', 2000), { maxBytes: MAX, ports: smaller.ports })).kept).toBe(false);

        const gif = fakePorts({ width: 300, height: 100, bytes: () => 5000 });
        expect((await prepareLogo(fileOf('l.gif', 'image/gif', 2000), { maxBytes: MAX, ports: gif.ports })).kept).toBe(false);

        const wide = fakePorts({ width: 600, height: 100, bytes: () => 5000 });
        expect((await prepareLogo(fileOf('l.png', 'image/png', 2000), { maxBytes: MAX, ports: wide.ports })).kept).toBe(false);

        const heavy = fakePorts({ width: 300, height: 100, bytes: () => 5000 });
        expect((await prepareLogo(fileOf('l.png', 'image/png', 300_000), { maxBytes: MAX, ports: heavy.ports })).kept).toBe(false);
    });

    it('refuses a file over the input limit before decoding it', async () => {
        const { ports } = fakePorts();
        const error = await prepareLogo(fileOf('huge.png', 'image/png', LOGO_MAX_INPUT_BYTES + 1), { maxBytes: MAX, ports }).catch(e => e);
        expect(error).toBeInstanceOf(LogoProblem);
        expect(error.message).toBe('The file is over 20 MB: choose a smaller image');
        expect(ports.decode).not.toHaveBeenCalled();
        const atLimit = await prepareLogo(fileOf('big.png', 'image/png', LOGO_MAX_INPUT_BYTES), { maxBytes: MAX, ports });
        expect(atLimit.type).toBe('image/webp');
    });

    it('says the file is not an image when the browser cannot decode it, or decodes no size', async () => {
        const { ports } = fakePorts();
        ports.decode.mockRejectedValueOnce(new Error('InvalidStateError'));
        const error = await prepareLogo(fileOf('doc.pdf', 'application/pdf', 5000), { maxBytes: MAX, ports }).catch(e => e);
        expect(error).toBeInstanceOf(LogoProblem);
        expect(error.message).toBe('The file is not an image Hub can read');
        expect(ports.render).not.toHaveBeenCalled();

        const empty = fakePorts({ width: 0, height: 0 });
        await expect(prepareLogo(fileOf('x.png', 'image/png', 10), { maxBytes: MAX, ports: empty.ports })).rejects.toThrow('not an image Hub can read');
        expect(empty.release).toHaveBeenCalled();
    });

    it('says so when the browser draws nothing', async () => {
        const { ports } = fakePorts();
        ports.render.mockResolvedValueOnce(null);
        await expect(prepareLogo(fileOf('p.png', 'image/png', 5000), { maxBytes: MAX, ports })).rejects.toBeInstanceOf(LogoProblem);
    });

    it('takes the limit and the longest side of the caller', async () => {
        const { ports } = fakePorts({ bytes: ({ width }) => (width > 200 ? 5000 : 500) });
        const logo = await prepareLogo(fileOf('p.jpg', 'image/jpeg', 3_000_000), { maxBytes: 1000, maxEdge: 300, ports });
        expect(renderedAt(ports)[0].slice(0, 2)).toEqual([300, 150]);
        expect(logo.width).toBe(169);
    });
});

describe('prepareLogo: an SVG', () => {
    const small = '<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12">\n  <path d="M0 0h24v12z"/>\n</svg>\n';
    const large = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path d="${'M0 0h1v1z '.repeat(400)}"/></svg>`;

    it('stays an SVG, minified, with the size it says', async () => {
        const { ports } = fakePorts();
        const logo = await prepareLogo(new File([small], 'logo.svg', { type: 'image/svg+xml' }), { maxBytes: MAX, ports });
        expect(logo).toMatchObject({ type: 'image/svg+xml', width: 24, height: 12, kept: true });
        expect(logo.file.name).toBe('logo.svg');
        expect(await logo.file.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path d="M0 0h24v12z"/></svg>');
        expect(ports.decode).not.toHaveBeenCalled();
        expect(ports.decodeSvg).not.toHaveBeenCalled();
    });

    it('is an SVG by its name when the browser gives it no type, and has no size when it says none', async () => {
        const { ports } = fakePorts();
        const logo = await prepareLogo(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'logo.SVG'), { maxBytes: MAX, ports });
        expect(logo).toMatchObject({ type: 'image/svg+xml', width: null, height: null });
    });

    it('is drawn as WebP at the full size when it is still over the limit (a vector is not drawn at its own small size)', async () => {
        const { ports, release } = fakePorts({ svg: { width: 24, height: 12 } });
        const logo = await prepareLogo(new File([large], 'big.svg', { type: 'image/svg+xml' }), { maxBytes: 2000, ports });
        expect(ports.decodeSvg).toHaveBeenCalledTimes(1);
        expect(renderedAt(ports)).toEqual([[512, 256, 0.9]]);
        expect(logo).toMatchObject({ type: 'image/webp', width: 512, height: 256, kept: false });
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('takes the proportions of the image when the SVG says none, and a square when nothing does', async () => {
        const bare = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${'M0 0h1v1z '.repeat(400)}"/></svg>`;
        const sized = fakePorts({ svg: { width: 100, height: 25 } });
        await prepareLogo(new File([bare], 'a.svg', { type: 'image/svg+xml' }), { maxBytes: 2000, ports: sized.ports });
        expect(renderedAt(sized.ports)[0].slice(0, 2)).toEqual([512, 128]);

        const none = fakePorts();
        await prepareLogo(new File([bare], 'a.svg', { type: 'image/svg+xml' }), { maxBytes: 2000, ports: none.ports });
        expect(renderedAt(none.ports)[0].slice(0, 2)).toEqual([512, 512]);
    });

    it('says so when it is over the limit and cannot be drawn', async () => {
        const { ports } = fakePorts();
        ports.decodeSvg.mockRejectedValueOnce(new Error('The image did not load'));
        const error = await prepareLogo(new File([large], 'big.svg', { type: 'image/svg+xml' }), { maxBytes: 2000, ports }).catch(e => e);
        expect(error).toBeInstanceOf(LogoProblem);
        expect(error.message).toMatch(/SVG is over 1 KB|SVG is over 2 KB/);
        expect(error.message).toMatch(/could not be converted to an image/);
    });
});

describe('describeLogo', () => {
    it('names the type, the size and the weight', () => {
        expect(describeLogo({ type: 'image/webp', width: 512, height: 160, bytes: 18 * 1024 })).toBe('WebP, 512 × 160, 18 KB');
        expect(describeLogo({ type: 'image/png', width: 10, height: 10, bytes: 10 })).toBe('PNG, 10 × 10, 1 KB');
        expect(describeLogo({ type: 'image/svg+xml', width: null, height: null, bytes: 2048 })).toBe('SVG, 2 KB');
    });
});
