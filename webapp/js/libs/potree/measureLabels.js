/**
 * Picking and labels of Potree measurements (HQ-08, out of Potree.vue): the measure under
 * the pointer, a name label that keeps its screen size, and the description tooltips of
 * measures and annotations. Listeners and body-level nodes go through the viewer's
 * PotreeSession, so they are released with the viewer. Names and descriptions come from
 * saved files: they are escaped before they reach innerHTML.
 */
import { escapeHtml } from '@/libs/sanitize';

/** A raycaster from the camera through the pointer. */
export function pointerRaycaster(viewer, event) {
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

/** Where a measure's name goes: area centroid, beside a point, beside a line's middle. */
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

/** Removes a measure's name label, its tooltip and their listeners. */
function clearNameLabel(measure, { viewer, session }) {
    if (measure._nameLabel) measure.remove(measure._nameLabel);
    if (measure._nameLabelTooltip) measure._nameLabelTooltip.remove();
    if (measure._labelUpdateHandler) session.untrack(viewer, 'update', measure._labelUpdateHandler);
    if (measure._tooltipHoverHandler) session.untrack(viewer.renderer.domElement, 'mousemove', measure._tooltipHoverHandler);
    measure._nameLabel = measure._nameLabelTooltip = measure._labelUpdateHandler = measure._tooltipHoverHandler = null;
}

/**
 * (Re)draws the measure's name as a sprite of constant screen size, with its description
 * in a tooltip while the pointer is over it. No name: no label.
 * @param {any} measure
 * @param {{ viewer: any, session: import('@/libs/potree/potreeSession').PotreeSession }} ctx
 */
export function updateNameLabel(measure, ctx) {
    const { viewer, session } = ctx;
    clearNameLabel(measure, ctx);
    if (!measure.name || !measure.name.trim() || !measure.points || !measure.points.length) return;

    const label = new Potree.TextSprite(measure.name);
    label.setTextColor({ r: 255, g: 255, b: 255, a: 1.0 });
    label.setBorderColor({ r: 0, g: 0, b: 0, a: 1.0 });
    label.setBackgroundColor({ r: 0, g: 0, b: 0, a: 0.7 });
    label.fontsize = 16;
    label.material.depthTest = false;
    label.material.opacity = 1;
    label.position.copy(labelPosition(measure));

    // Constant screen size: scale with the camera distance
    const rescale = () => {
        const scale = viewer.scene.getActiveCamera().position.distanceTo(label.position) * 0.30 * 0.02;
        label.scale.set(scale, scale, scale);
    };
    rescale();
    measure._labelUpdateHandler = rescale;
    session.track(viewer, 'update', rescale);
    measure._nameLabel = label;
    measure.add(label);

    if (!measure.description || !measure.description.trim()) return;
    const tooltip = bodyTooltip(session, 'potree-measurement-tooltip',
        `<strong>${escapeHtml(measure.name)}</strong><br>${escapeHtml(measure.description)}`);
    measure._nameLabelTooltip = tooltip;
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
    if (!el || !annotation.description || !annotation.description.trim()) return;

    const tooltip = bodyTooltip(session, 'potree-annotation-tooltip', escapeHtml(annotation.description));
    annotation._descriptionTooltip = tooltip;
    const handlers = [
        [el, 'mouseenter', e => { placeAt(tooltip, e.clientX, e.clientY); tooltip.style.display = 'block'; }],
        [el, 'mousemove', e => placeAt(tooltip, e.clientX, e.clientY)],
        [el, 'mouseleave', () => { tooltip.style.display = 'none'; }]
    ];
    handlers.forEach(([target, type, fn]) => session.track(target, type, fn));
    annotation._tooltipHandlers = handlers;
}
