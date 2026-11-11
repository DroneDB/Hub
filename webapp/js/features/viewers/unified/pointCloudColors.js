/**
 * The colours of a COPC point cloud as 8-bit values, whatever depth the file stores them in.
 *
 * The LAS specification asks for 16-bit RGB, but many writers (ODM among them) store 0-255.
 * Giro3D reads every colour as 16-bit and divides it by 256 to fit 8 bits, so a cloud of 8-bit
 * colours turns black. As Potree does, the depth comes from the values: a cloud whose samples
 * stay at or below 255 stores 8 bits. The decision is taken once per cloud, on its root node
 * (a sample of the whole cloud), so a dark corner of a 16-bit cloud is not brightened as if it
 * were 8-bit.
 */

const EIGHT_BIT_MAX = 255;

/**
 * Bits to drop from the stored colour values to get 8 bits: 8 for 16-bit colours, 0 for colours
 * stored as 0-255.
 * @param {ArrayLike<number>} values interleaved R, G, B values as the file stores them
 * @returns {number}
 */
export function colorShift(values) {
    for (let i = 0; i < values.length; i++) {
        if (values[i] > EIGHT_BIT_MAX) return 8;
    }
    return 0;
}

/**
 * The stored colour values as 8-bit values.
 * @param {ArrayLike<number>} values interleaved R, G, B values as the file stores them
 * @param {number} shift from colorShift
 * @returns {Uint8Array}
 */
export function toEightBitColors(values, shift) {
    const out = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i++) {
        out[i] = Math.min(values[i] >> shift, EIGHT_BIT_MAX);
    }
    return out;
}

const isColor = attribute => attribute && attribute.interpretation === 'color';

/**
 * A COPCSource whose colour buffers are 8-bit values of the depth the cloud stores.
 * @param {any} COPCSource Giro3D's COPCSource class
 * @param {any} Uint8BufferAttribute three.js's Uint8BufferAttribute class
 * @returns {any} the source class
 */
export function withColorDepth(COPCSource, Uint8BufferAttribute) {
    return class ColorDepthCOPCSource extends COPCSource {
        constructor(options) {
            // The stored values, untouched: Giro3D's own 8-bit conversion loses 8-bit colours
            super({ ...options, compressColorsTo8Bit: false });
            this._root = null;
            this._colorShift = null;
        }

        async getMetadata() {
            const metadata = await super.getMetadata();
            const attributes = metadata.attributes.map(a => (isColor(a) ? { ...a, size: 1, min: 0, max: EIGHT_BIT_MAX } : a));
            return { ...metadata, attributes };
        }

        async getHierarchy() {
            this._root = await super.getHierarchy();
            return this._root;
        }

        async getNodeData(params) {
            const data = await super.getNodeData(params);
            const index = (params.attributes || []).findIndex(isColor);
            const colors = index >= 0 ? data.attributes[index] : null;
            if (!colors) return data;
            const shift = await this.colorShiftOf(params, colors.array);
            const attributes = data.attributes.slice();
            attributes[index] = new Uint8BufferAttribute(toEightBitColors(colors.array, shift), 3, true);
            return { ...data, attributes };
        }

        /** The shift of the cloud, from its root node (read once); the node's own when the root has no colours. */
        colorShiftOf(params, values) {
            if (!this._colorShift) {
                const root = this._root;
                const attribute = params.attributes.find(isColor);
                this._colorShift = !root || params.node.id === root.id
                    ? Promise.resolve(colorShift(values))
                    : super.getNodeData({ node: root, attributes: [attribute], position: false })
                        .then(rootData => {
                            const rootColors = rootData.attributes[0];
                            return rootColors && rootColors.count ? colorShift(rootColors.array) : colorShift(values);
                        });
                // A failed read of the root is not the cloud's depth: the next node tries again
                this._colorShift.catch(() => { this._colorShift = null; });
            }
            return this._colorShift.catch(() => colorShift(values));
        }
    };
}
