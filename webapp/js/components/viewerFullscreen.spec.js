/**
 * Every immersive viewer has the fullscreen control of the ViewerShell (FR-VWR-38): the 3D, model and Nexus viewers
 * through the navigation toolbar (FR-VWR-11), the point cloud and the splat viewers through the button of the view bar,
 * which stands over the view when the viewer is embedded (ShareEmbed: a frame that allows fullscreen).
 *
 * The attributes each viewer gives its <ViewerShell> are read from its template (the viewers themselves need WebGL), and
 * the real shell is mounted with them, embedded, as the frame of ShareEmbed shows it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { parse } from 'vue/compiler-sfc';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import { readSource } from '@/specs/cssSource';
import ViewerShell from './ViewerShell.vue';

const ELEMENT = 1;
const ATTRIBUTE = 6;

/** The first element of a template tree with this tag */
function findElement(node, tag) {
    if (node.type === ELEMENT && node.tag === tag) return node;
    for (const child of node.children ?? []) {
        const found = findElement(child, tag);
        if (found) return found;
    }
    return null;
}

/** The static attributes (name -> value, true when it has none) and the bound names of the <ViewerShell> of a viewer */
function shellOf(file) {
    const { descriptor } = parse(readSource(__dirname, file), { filename: file });
    const shell = findElement(descriptor.template.ast, 'ViewerShell');
    const attributes = {};
    const bound = [];
    for (const prop of shell?.props ?? []) {
        if (prop.type === ATTRIBUTE) attributes[prop.name] = prop.value ? prop.value.content : true;
        else if (prop.name === 'bind' && prop.arg?.content) bound.push(prop.arg.content);
    }
    return { attributes, bound };
}

/** The props of the shell that a viewer sets statically, camelCased */
const staticProps = attributes => Object.fromEntries(Object.entries(attributes)
    .filter(([name]) => name.startsWith('fullscreen-') || name === 'nav-toolbar')
    .map(([name, value]) => [name.replace(/-(\w)/g, (_, c) => c.toUpperCase()), value]));

let wrapper;
const request = vi.fn();

async function mountEmbedded(props) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
    await router.push('/');
    wrapper = mount(ViewerShell, {
        props,
        slots: { default: '<div class="viewer-content" />' },
        global: { plugins: [router, PrimeVue], provide: { embed: true } }
    });
    await flushPromises();
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete HTMLElement.prototype.requestFullScreen;
    request.mockClear();
});

describe('the viewers of the Hub and their fullscreen control (FR-VWR-38)', () => {
    it.each([
        ['the 3D viewer', '../features/viewers/unified/UnifiedViewer.vue'],
        ['the model viewers', '../features/viewers/model/ModelViewerShell.vue']
    ])('%s asks its shell for the navigation toolbar, which has the fullscreen button', (_name, file) => {
        expect(shellOf(file).attributes['nav-toolbar']).toBe(true);
    });

    it.each([
        ['the point cloud viewer', '../features/viewers/pointcloud/PotreeViewer.vue', 'bottom-right'],
        ['the splat viewer', '../features/viewers/splat/SplatViewer.vue', 'top-right']
    ])('%s, embedded, has the fullscreen button over its view, in the %s corner, and it toggles fullscreen', async (_name, file, corner) => {
        const { attributes } = shellOf(file);
        expect(attributes['fullscreen-button']).toBe(true);
        HTMLElement.prototype.requestFullScreen = request;
        await mountEmbedded(staticProps(attributes));
        expect(wrapper.find('.viewer-bar').exists()).toBe(false);
        const button = wrapper.find('.container-wrapper > button.viewer-fullscreen-overlay');
        expect(button.exists()).toBe(true);
        expect(button.classes()).toContain(corner);
        expect(button.attributes('aria-label')).toBe('Fullscreen');
        expect(button.attributes('aria-pressed')).toBe('false');
        await button.trigger('click');
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.contexts[0]).toBe(wrapper.element);
    });

    it('the point cloud viewer tells its shell when F is its own (PotreeViewer.spec has the rule)', () => {
        expect(shellOf('../features/viewers/pointcloud/PotreeViewer.vue').bound).toContain('fullscreen-key');
    });

    it('the splat viewer keeps its top right badges beside the button of the shell', () => {
        const scss = readSource(__dirname, '../features/viewers/splat/Splat.scss');
        expect(scss).toMatch(/#splat\.has-fullscreen-overlay \.top-right-stack \{\s*right: calc\(2 \* var\(--ddb-spacing-md\) \+ 2\.25rem\);/);
    });

    it('the map has its own Fullscreen button in its toolbar', () => {
        expect(readSource(__dirname, '../features/viewers/map/MapToolbar.vue')).toContain('aria-label="Fullscreen"');
    });
});
