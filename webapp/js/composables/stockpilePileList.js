/**
 * The piles of "Find all piles", for the stockpile panel (a part of useStockpileVolume: its state and methods are
 * merged into the feature's scope and use its `this`).
 *
 * One scan of the whole raster finds the piles. They are listed (the biggest first), drawn on the map in a layer of
 * their own and each one is measured (the volume of the row, from the base of the detected piles), a few at a time.
 * A row is chosen (its volume is the Result) without being a measurement; Add makes the piles the user wants
 * measurements of the map, which the toolbar's Save writes.
 */
import { toRaw } from 'vue';
import { createPilePreview } from '@/libs/map/stockpilePreview';
import { sameOutline, stockpilePolygonOf } from '@/libs/map/stockpileStorage';
import { runLimited } from '@/libs/runLimited';
import { friendlyStockpileError } from '@/libs/stockpileErrors';
import { BASE_METHOD, PILE_OUTLINE, baseMethodFor } from '@/libs/stockpileBase';

// How many piles of the list are measured at once: the server does the volumes one raster read each
const PILES_IN_FLIGHT = 4;

/** The state of the list; `_` members are the feature's own. */
export const pileListState = () => ({
    // Every pile of the raster found at once: null before a search, else the piles, the biggest first. Each one
    // is the detection with `measured` (its volume, from `stockpilePilesBase`) and `measureState`
    // ('pending' | 'measuring' | 'done' | 'failed')
    stockpilePiles: null,
    stockpilePilesLoading: false,
    stockpilePilesError: null,
    // The base the volumes of the list are measured from
    stockpilePilesBase: BASE_METHOD.BEST_FIT,
    // The id of the pile of the list that is the chosen one (it shows as chosen)
    stockpileChosenPile: null,
    // The piles of the list that are measurements now: pile id -> id of its feature
    stockpileAddedPiles: {},
    // The found piles on the map (libs/map/stockpilePreview), in a layer of their own
    _stockpilePreview: null,
    // The answer of a search that a later one, the closing of the panel or another raster overtook is not shown
    _stockpilePilesTurn: 0,
    // The same for the measuring of the list: a base change, a new list or the end of the panel overtakes it
    _stockpileMeasureTurn: 0
});

export const pileListMethods = {
    /** The list of the piles found at once is forgotten (a search or a measuring in flight is overtaken). */
    _resetStockpilePiles() {
        this._stockpilePilesTurn++;
        this._stockpileMeasureTurn++;
        // The pile shown was the list's: with its row gone the panel has nothing of it to keep
        if (this.stockpileChosenPile !== null && !this._chosenStockpileFeatureId) {
            this.stockpileResult = null;
            this.stockpileDetectedPolygon = null;
        }
        this.stockpilePiles = null;
        this.stockpilePilesLoading = false;
        this.stockpilePilesError = null;
        this.stockpileAddedPiles = {};
        this._setChosenPileRow(null);
        if (this._stockpilePreview) this._stockpilePreview.clear();
    },

    /**
     * "Find all piles": one scan of the whole raster, with the sensitivity of the panel. The piles are listed (the
     * biggest first) and drawn on the map, and each one is measured (the volume of the row); the user chooses one
     * with chooseStockpilePile and adds the ones they want to the measurements with addStockpilePiles.
     */
    async findAllStockpiles() {
        if (!this.rasterFilePath || !this.dataset) return;
        this._resetStockpilePiles();
        const turn = this._stockpilePilesTurn;
        const path = this.rasterFilePath;
        this.stockpilePilesLoading = true;
        let listed = false;
        try {
            const found = await this.dataset.detectAllStockpiles(path, { sensitivity: this.stockpileSensitivity });
            if (turn !== this._stockpilePilesTurn) return;
            const piles = Array.isArray(found?.stockpiles) ? found.stockpiles : [];
            this.stockpilePiles = piles.map(pile => ({ ...pile, measured: null, measureState: 'pending' }));
            this._linkPilesOnTheMap(path);
            this._showPilePreview();
            this._syncAddedPiles();
            listed = true;
        } catch (e) {
            console.error('Finding all the piles failed:', e);
            if (turn !== this._stockpilePilesTurn) return;
            this.stockpilePiles = null;
            this.stockpilePilesError = friendlyStockpileError(e && e.message,
                'Could not find the piles of this raster. Try again, or adjust the sensitivity.');
        } finally {
            if (turn === this._stockpilePilesTurn) this.stockpilePilesLoading = false;
        }
        if (listed) await this._measureStockpilePiles();
    },

    /**
     * Measure every pile of the list from the base of the detected piles (the one the user picked, else the
     * best-fit plane), at most PILES_IN_FLIGHT at a time. Each row keeps its volume, so choosing and adding a pile
     * ask the server for nothing. A base change, a new list, Clear and Close overtake it: the answers of the turn
     * that was overtaken are dropped and the piles not yet started are never asked for.
     */
    async _measureStockpilePiles() {
        const piles = this.stockpilePiles;
        if (!piles || !piles.length || !this.dataset) return;
        const turn = ++this._stockpileMeasureTurn;
        const path = this.rasterFilePath;
        const baseMethod = baseMethodFor(PILE_OUTLINE.DETECTED, this._chosenStockpileBaseMethod);
        const flatElevation = this.stockpileFlatElevation;
        const isCurrent = () => turn === this._stockpileMeasureTurn;
        this.stockpilePilesBase = baseMethod;
        // The panel shows the base the list is measured from, unless it shows a pile of its own
        if (!this._chosenStockpileFeatureId) this.stockpileBaseMethod = baseMethod;
        piles.forEach(pile => {
            pile.measured = null;
            pile.measureState = 'measuring';
        });
        await runLimited([...piles], PILES_IN_FLIGHT, async pile => {
            try {
                const volume = await this._measureStockpile(pile.polygon, path, baseMethod, flatElevation);
                if (!isCurrent()) return;
                pile.measured = volume;
                pile.measureState = 'done';
            } catch (e) {
                console.warn('Could not measure a pile of the list:', e);
                if (!isCurrent()) return;
                pile.measureState = 'failed';
            }
            // The pile that is the chosen one shows its volume as soon as it has one
            if (pile.id === this.stockpileChosenPile && !this._chosenStockpileFeatureId) this._showListPile(pile);
        }, { shouldContinue: isCurrent });
    },

    /**
     * The user chose a pile of the list (a click on its row, or on its outline on the map): the Result shows the
     * pile with the volume of its row, and its outline is the chosen one on the map. Nothing is added to the
     * measurements: Add does that. A pile that was added is chosen as the measurement it is.
     * @param {{ id: number }} pile  a pile of `stockpilePiles`
     * @param {{ fit?: boolean }} [options]  `fit`: bring the pile into view (a row asks for it, a click on the pile does not)
     */
    chooseStockpilePile(pile, { fit = true } = {}) {
        const listed = pile && this.stockpilePiles && this.stockpilePiles.find(p => p.id === pile.id);
        if (!listed) return;
        this._endStockpileEdit();
        // A pile being measured, or a saved one being read, is not the chosen one any more
        this._stockpileRestoreTurn++;
        this.stockpileLoading = false;
        const feature = this._stockpileFeatureById(this.stockpileAddedPiles[listed.id]);
        this._setChosenPileRow(listed.id);
        if (feature) this.selectStockpileFeature(feature);
        else this._showListPile(listed);
        if (fit && this._stockpilePreview && this.map) this._stockpilePreview.fit(toRaw(this.map), listed.id);
    },

    /** The Result for a pile of the list that is not a measurement: its measured volume, with the material of the panel. */
    _showListPile(pile) {
        this._chosenStockpileFeatureId = null;
        this.stockpileDetectedPolygon = pile.polygon;
        this.stockpileTitle = '';
        this.stockpileDescription = '';
        if (pile.measureState === 'failed') {
            this.stockpileResult = null;
            this.stockpileError = 'Cannot calculate the volume of this pile. Try another one.';
            return;
        }
        this.stockpileError = null;
        // Still measuring: its row says so, and this runs again when it has its volume
        if (!pile.measured) {
            this.stockpileResult = null;
            return;
        }
        this.stockpileBaseMethod = pile.measured.basePlaneMethod ?? this.stockpilePilesBase;
        this.stockpileResult = this._withStockpileEstimate({ ...pile.measured, confidence: pile.confidence });
    },

    /**
     * Add piles of the list to the measurements (the toolbar's Save writes them): each one as a measurement of its
     * own with its measured volume, the material of the panel and, for the chosen pile, the title and the
     * description of the panel. A pile that was added stays one measurement, and a pile that is not measured yet is left out.
     * @param {Array<{ id: number }>} piles  piles of `stockpilePiles`
     * @returns {number}  how many were added
     */
    addStockpilePiles(piles) {
        if (!this.stockpilePiles) return 0;
        const entries = [];
        const seen = new Set();
        for (const wanted of piles ?? []) {
            const pile = wanted && this.stockpilePiles.find(p => p.id === wanted.id);
            if (!pile || seen.has(pile.id) || pile.measureState !== 'done' || this._stockpileFeatureById(this.stockpileAddedPiles[pile.id])) continue;
            seen.add(pile.id);
            const result = this._withStockpileEstimate({ ...pile.measured, confidence: pile.confidence });
            entries.push({
                pile,
                polygon: pile.polygon,
                properties: this._buildStockpileProperties(result, { identify: pile.id === this.stockpileChosenPile })
            });
        }
        if (!entries.length) return 0;
        const ids = this._importStockpiles(entries);
        if (ids.length !== entries.length) return 0;
        entries.forEach(({ pile }, i) => { this.stockpileAddedPiles[pile.id] = ids[i]; });
        this._syncAddedPiles();
        // The chosen pile is a measurement now: its title, its material and its base are written to it from here on
        const chosen = entries.findIndex(({ pile }) => pile.id === this.stockpileChosenPile);
        if (chosen >= 0 && !this._chosenStockpileFeatureId) this._chosenStockpileFeatureId = ids[chosen];
        return ids.length;
    },

    /**
     * The piles of the list that are measurements on the map already (added before the page was opened again, or
     * read from the measurements file) are linked to them, as if they had been added from this list: their rows
     * show them as added and Add does not make a second measurement of them. A pile is one of them when the
     * measurement has its outline and was measured on the same raster (or does not say which, as older files do).
     * @param {string} path  the raster the piles were found on
     */
    _linkPilesOnTheMap(path) {
        const mc = this.measureControls;
        if (!mc || !mc.source || !this.stockpilePiles) return;
        const projection = this._mapProjection();
        const onMap = mc.source.getFeatures()
            .filter(f => f.get('measurementType') === 'stockpile' && (!f.get('sourceRaster') || f.get('sourceRaster') === path))
            .map(f => ({ id: f.get('id'), polygon: stockpilePolygonOf(toRaw(f), projection) }));
        const taken = new Set();
        for (const pile of this.stockpilePiles) {
            const match = onMap.find(m => m.id && !taken.has(m.id) && sameOutline(m.polygon, pile.polygon));
            if (!match) continue;
            taken.add(match.id);
            this.stockpileAddedPiles[pile.id] = match.id;
        }
    },

    /** The row of the list whose pile is this feature, or null. @param {string} featureId */
    _pileRowOf(featureId) {
        if (!featureId) return null;
        const row = Object.keys(this.stockpileAddedPiles).find(key => this.stockpileAddedPiles[key] === featureId);
        return row === undefined ? null : Number(row);
    },

    /** The row `id` of the list is the chosen one (null: none), in the panel and on the map. */
    _setChosenPileRow(id) {
        this.stockpileChosenPile = id;
        if (this._stockpilePreview) this._stockpilePreview.setChosen(id);
    },

    /** The pointer is over a row of the list (null: it left): its outline is emphasised on the map. */
    hoverStockpilePile(pile) {
        if (this._stockpilePreview) this._stockpilePreview.setHovered(pile ? pile.id : null);
    },

    /** The preview layer shows the piles that are added as such (dimmed). */
    _syncAddedPiles() {
        if (this._stockpilePreview) this._stockpilePreview.setAdded(Object.keys(this.stockpileAddedPiles).map(Number));
    },

    /** The layer of the found piles, created with the first list and put on the map once. */
    _ensurePilePreviewLayer() {
        if (!this.map) return null;
        if (!this._stockpilePreview) {
            this._stockpilePreview = createPilePreview();
            this.map.addLayer(this._stockpilePreview.layer);
        }
        return this._stockpilePreview;
    },

    /** Draw the piles of the list on the map. */
    _showPilePreview() {
        const preview = this._ensurePilePreviewLayer();
        if (preview) preview.show(this.stockpilePiles, this._mapProjection());
    },
};
