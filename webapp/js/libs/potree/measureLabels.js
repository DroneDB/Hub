/**
 * Picking and labels of Potree measurements: the measure under
 * the pointer, the label of a measure (its name, category, severity and description: itemLabel) that keeps its screen
 * size, and the description tooltips of measures and annotations. Listeners and body-level nodes go through the viewer's
 * PotreeSession, so they are released with the viewer. Names and descriptions come from
 * saved files: they are escaped before they reach innerHTML.
 */
import { escapeHtml, textToHtml, htmlToText } from '@/libs/sanitize';
import { measureLabelFactor } from '@/libs/measureScale';
import { annotationFieldsOf } from '@/libs/potree/measureStyle';
import { itemLabelClass, itemLabelLines } from '@/libs/potree/itemLabel';

/** A raycaster from the camera through the pointer. */
function pointerRaycaster(viewer, event) {
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, viewer.scene.getActiveCamera());
    return raycaster;
}

/** The measure whose marker spheres are under the pointer, or null. */
export function measureAt(viewer, event) {
    const raycaster = pointerRaycaster(viewer, event);
    raycaster.params.Points = { threshold: 5 };
    return (viewer.scene.measurements || []).find(m => m.spheres && m.spheres.length &&
        raycaster.intersectObjects(m.spheres, true).length > 0) || null;
}

/** The HTMLElement of an annotation (Potree keeps a jQuery object). */
export function annotationElement(annotation) {
    const dom = annotation && annotation.domElement;
    const el = dom && dom.jquery ? dom[0] : dom;
    return el instanceof HTMLElement ? el : null;
}

/** A fixed-position dark tooltip on document.body, owned by the session. */
function bodyTooltip(session, className, html) {
    const tooltip = document.createElement('div');
    tooltip.className = `${className} ddb-tooltip ddb-tooltip--dark`;
    tooltip.innerHTML = html;
    tooltip.style.cssText = 'position: fixed; display: none;';
    document.body.appendChild(session.adopt(tooltip));
    return tooltip;
}

const placeAt = (tooltip, x, y) => {
    tooltip.style.left = (x + 15) + 'px';
    tooltip.style.top = (y - 10) + 'px';
};

/** Where a measure's label goes: area centroid, beside a point, beside a line's middle. */
function labelPosition(measure) {
    const points = measure.points;
    const position = new THREE.Vector3();
    const offset = new THREE.Vector3();
    if (measure.showArea && measure.closed && points.length >= 3) {
        points.forEach(p => position.add(p.position));
        position.divideScalar(points.length);
    } else if (points.length === 1) {
        position.copy(points[0].position);
        offset.set(0.5, 0.5, 0);
    } else if (points.length === 2) {
        position.copy(points[0].position).add(points[1].position).divideScalar(2);
        const dir = new THREE.Vector3().subVectors(points[1].position, points[0].position).normalize();
        offset.crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.3);
    } else {
        position.copy(points[Math.floor(points.length / 2)].position);
        offset.set(0.3, 0, 0);
    }
    return position.add(offset);
}

/** Removes a measure's label, its tooltip and their listeners. */
function clearItemLabel(measure, { viewer, session }) {
    if (measure._itemLabel) {
        measure.remove(measure._itemLabel);
        measure._itemLabel.dispose?.();
    }
    if (measure._itemLabelTooltip) measure._itemLabelTooltip.remove();
    if (measure._labelUpdateHandler) session.untrack(viewer, 'update', measure._labelUpdateHandler);
    if (measure._tooltipHoverHandler) session.untrack(viewer.renderer.domElement, 'mousemove', measure._tooltipHoverHandler);
    measure._itemLabel = measure._itemLabelTooltip = measure._labelUpdateHandler = measure._tooltipHoverHandler = null;
}

/** How far above its point the label of a point stands, in CSS px. */
const POINT_LABEL_GAP_PX = 12;
/** Potree's rule for the screen size of its labels: 70 over the projected radius of one unit (see its MeasuringTool). */
const POTREE_LABEL_SIZE = 70;

/** The size of the view in CSS px. */
const viewSize = viewer => ({ width: viewer.renderer.domElement.clientWidth || 1, height: viewer.renderer.domElement.clientHeight || 1 });

/**
 * The point `px` CSS px above `world` on the screen, at the same distance from the camera.
 * @param {any} camera
 * @param {any} world  a Vector3
 * @param {number} px
 * @param {number} height  the height of the view in CSS px
 */
function aboveOnScreen(camera, world, px, height) {
    const distance = camera.position.distanceTo(world);
    const ndc = world.clone().project(camera);
    ndc.y += (2 * px) / height;
    const point = ndc.unproject(camera);
    if (!camera.isPerspectiveCamera) return point;
    return point.sub(camera.position).normalize().multiplyScalar(distance).add(camera.position);
}

/**
 * How many CSS px one unit of the scene is at this distance from the camera (Potree's Utils.projectedRadius of 1).
 * @param {any} camera
 * @param {number} distance
 * @param {{ width: number, height: number }} size
 */
function pixelsPerUnit(camera, distance, { width, height }) {
    if (camera.isOrthographicCamera) return (camera.projectionMatrix.elements[0] * width) / 2;
    return height / (2 * Math.tan((camera.fov * Math.PI) / 360) * Math.max(distance, 1e-6));
}

/**
 * The scale that gives a label the screen size Potree gives its own at this distance, times the factor of a large view.
 * @param {any} camera
 * @param {number} distance
 * @param {{ width: number, height: number }} size
 */
function labelScale(camera, distance, size) {
    return (POTREE_LABEL_SIZE / pixelsPerUnit(camera, distance, size)) * measureLabelFactor(size.height);
}

/**
 * The text of an item of the viewer, as its label shows it: its name and description as text, and its category and
 * severity.
 * @param {any} measure
 */
const labelItemOf = measure => {
    const { category, severity } = annotationFieldsOf(measure);
    return { name: htmlToText(measure.name), description: measure.description || '', category, severity };
};

/**
 * (Re)draws the label of a measure (itemLabel: its name, its category and severity, its description) as a sprite of
 * constant screen size, with the whole description in a tooltip while the pointer is over it. A point shows the label
 * above it instead of its coordinates. An item with nothing to show has no label (and a point its coordinates).
 * @param {any} measure
 * @param {{ viewer: any, session: import('@/libs/potree/potreeSession').PotreeSession, schema?: () => any }} ctx
 *   schema: the organization's categories and severities, for their names and the colour of a severity
 */
export function updateItemLabel(measure, ctx) {
    const { viewer, session } = ctx;
    clearItemLabel(measure, ctx);
    const item = labelItemOf(measure);
    const lines = itemLabelLines(item, ctx.schema?.());
    if (!lines.length || !measure.points || !measure.points.length) return;

    const ItemLabel = itemLabelClass(Potree);
    const label = new ItemLabel('');
    label.material.depthTest = false;
    label.material.opacity = 1;
    label.setLines(lines);
    const isPoint = measure.points.length === 1;
    // A point's label stands above it: its bottom edge is the anchor
    if (isPoint && label.sprite?.center) label.sprite.center.set(0.5, 0);
    label.position.copy(labelPosition(measure));

    // Each frame, after Potree's measuring tool placed and sized its own labels: the place and the screen size, and a
    // point's coordinates hidden (Potree shows them again at each update of the measure)
    const place = () => {
        const camera = viewer.scene.getActiveCamera();
        const size = viewSize(viewer);
        if (isPoint && measure.points[0]) {
            label.position.copy(aboveOnScreen(camera, measure.points[0].position, POINT_LABEL_GAP_PX, size.height));
            (measure.coordinateLabels || []).forEach(coordinates => { coordinates.visible = false; });
        }
        const scale = labelScale(camera, camera.position.distanceTo(label.position), size);
        label.scale.set(scale, scale, scale);
    };
    place();
    measure._labelUpdateHandler = place;
    session.track(viewer, 'update', place);
    measure._itemLabel = label;
    measure.add(label);

    if (!item.description.trim()) return;
    const tooltip = bodyTooltip(session, 'potree-measurement-tooltip',
        `${item.name.trim() ? `<strong>${escapeHtml(item.name)}</strong><br>` : ''}${escapeHtml(item.description)}`);
    measure._itemLabelTooltip = tooltip;
    const dom = viewer.renderer.domElement;
    measure._tooltipHoverHandler = event => {
        if (pointerRaycaster(viewer, event).intersectObject(label, true).length > 0) {
            const p = label.position.clone().project(viewer.scene.getActiveCamera());
            const rect = dom.getBoundingClientRect();
            placeAt(tooltip, ((p.x + 1) / 2) * rect.width + rect.left, ((-p.y + 1) / 2) * rect.height + rect.top);
            tooltip.style.display = 'block';
        } else {
            tooltip.style.display = 'none';
        }
    };
    session.track(dom, 'mousemove', measure._tooltipHoverHandler);
}

/**
 * The description tooltip of an annotation (its title is Potree's own).
 * @param {any} annotation
 * @param {{ session: import('@/libs/potree/potreeSession').PotreeSession }} ctx
 */
export function updateAnnotationTooltip(annotation, { session }) {
    if (annotation._descriptionTooltip) annotation._descriptionTooltip.remove();
    (annotation._tooltipHandlers || []).forEach(([target, type, fn]) => session.untrack(target, type, fn));
    annotation._descriptionTooltip = null;
    annotation._tooltipHandlers = [];
    const el = annotationElement(annotation);
    // Potree holds the description as HTML: the tooltip shows its text, escaped once, with its line breaks
    const text = htmlToText(annotation.description);
    if (!el || !text.trim()) return;

    const tooltip = bodyTooltip(session, 'potree-annotation-tooltip', textToHtml(text));
    annotation._descriptionTooltip = tooltip;
    const handlers = [
        [el, 'mouseenter', e => { placeAt(tooltip, e.clientX, e.clientY); tooltip.style.display = 'block'; }],
        [el, 'mousemove', e => placeAt(tooltip, e.clientX, e.clientY)],
        [el, 'mouseleave', () => { tooltip.style.display = 'none'; }]
    ];
    handlers.forEach(([target, type, fn]) => session.track(target, type, fn));
    annotation._tooltipHandlers = handlers;
}
