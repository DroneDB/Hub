/**
 * The shell of the analysis panels: the header every panel shares (with its optional subtitle and
 * tool bar, which stay in view together), and on a phone the button that
 * folds the sheet to its header. The fold keeps the content mounted, so a form, a detection in
 * progress or a selected pile survives it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AnalysisPanel from './AnalysisPanel.vue';
import { readSource, ruleOf, mediaBlock, containerBlock } from '@/specs/cssSource';

const mountPanel = (props = {}, attrs = {}) => mount(AnalysisPanel, {
    props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health', ...props },
    attrs,
    slots: { default: '<div class="panel-body"><input class="kept"></div>' }
});

describe('AnalysisPanel', () => {
    it('shows the icon and the title in the header and takes its accent from the variant', () => {
        const wrapper = mountPanel();
        expect(wrapper.find('.panel-title i').classes()).toEqual(['fas', 'fa-leaf']);
        expect(wrapper.find('.panel-title').text()).toBe('Plant Health');
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['analysis-panel', 'analysis-panel--plant-health']));
        expect(mountPanel({ variant: 'stockpile' }).classes()).toContain('analysis-panel--stockpile');
    });

    it('emits close from the close button', async () => {
        const wrapper = mountPanel();
        const close = wrapper.find('.close-btn');
        expect(close.attributes('aria-label')).toBe('Close');
        expect(close.attributes('title')).toBe('Close');
        await close.trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('opens unfolded and the toggle folds and unfolds it', async () => {
        const wrapper = mountPanel();
        const toggle = wrapper.find('.sheet-toggle');
        expect(wrapper.classes()).not.toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(toggle.attributes('aria-label')).toBe('Minimise');
        expect(toggle.find('i').classes()).toContain('fa-chevron-down');

        await toggle.trigger('click');
        expect(wrapper.classes()).toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(toggle.attributes('aria-label')).toBe('Expand');
        expect(toggle.attributes('title')).toBe('Expand');
        expect(toggle.find('i').classes()).toContain('fa-chevron-up');

        await toggle.trigger('click');
        expect(wrapper.classes()).not.toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('true');
    });

    it('keeps the content mounted while it is folded: the same elements, not new ones', async () => {
        const wrapper = mountPanel();
        const input = wrapper.find('.kept').element;
        await wrapper.find('.sheet-toggle').trigger('click');
        expect(wrapper.find('.kept').exists()).toBe(true);
        expect(wrapper.find('.kept').element).toBe(input);
    });

    it('keeps the classes and the test id the panel is given on its root', () => {
        const wrapper = mountPanel({}, { class: 'stockpile-panel', 'data-testid': 'stockpile-panel' });
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['analysis-panel', 'stockpile-panel']));
        expect(wrapper.attributes('data-testid')).toBe('stockpile-panel');
    });

    it('opens unfolded again when it is mounted again', async () => {
        const first = mountPanel();
        await first.find('.sheet-toggle').trigger('click');
        expect(first.classes()).toContain('is-minimised');
        expect(mountPanel().classes()).not.toContain('is-minimised');
    });

    describe('the subtitle', () => {
        it('is a muted second line under the title, in the header, only when there is one', () => {
            const wrapper = mountPanel({ subtitle: 'MicaSense RedEdge-MX' });
            const subtitle = wrapper.get('.panel-header .panel-subtitle');
            expect(subtitle.text()).toBe('MicaSense RedEdge-MX');
            // The title keeps its own text: the line is not part of it
            expect(wrapper.get('.panel-title').text()).toBe('Plant Health');
            expect(mountPanel().find('.panel-subtitle').exists()).toBe(false);
            expect(mountPanel({ subtitle: '' }).find('.panel-subtitle').exists()).toBe(false);
        });

        it('can be given as a slot, for a line that needs a title or a test id of its own', () => {
            const wrapper = mount(AnalysisPanel, {
                props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health' },
                slots: { default: '<div class="panel-body" />', subtitle: '<span data-testid="sensor" title="id">RedEdge</span>' }
            });
            expect(wrapper.get('.panel-subtitle [data-testid="sensor"]').text()).toBe('RedEdge');
        });
    });

    describe('the tools slot', () => {
        const withTools = (props = {}) => mount(AnalysisPanel, {
            props: { icon: 'fas fa-chart-bar', title: 'Raster Analysis', variant: 'raster', ...props },
            slots: { default: '<div class="panel-body">body</div>', tools: '<button class="tool-btn">Profile</button>' }
        });

        it('is the tool bar, in the top block between the header and the body', () => {
            const wrapper = withTools();
            const top = wrapper.get('.panel-top');
            expect([...top.element.children].map(c => c.className.split(' ')[0])).toEqual(['panel-header', 'panel-tools']);
            expect(top.get('.panel-tools .tool-btn').text()).toBe('Profile');
            // The root: the top block, the body, then no footer
            expect([...wrapper.element.children].map(c => c.className.split(' ')[0])).toEqual(['panel-top', 'panel-body']);
        });

        it('is a toolbar named after the panel', () => {
            const tools = withTools().get('.panel-tools');
            expect(tools.attributes('role')).toBe('toolbar');
            expect(tools.attributes('aria-label')).toBe('Raster Analysis tools');
        });

        it('is absent without the slot, and the top block holds the header alone', () => {
            const wrapper = mountPanel();
            expect(wrapper.find('.panel-tools').exists()).toBe(false);
            expect([...wrapper.get('.panel-top').element.children].map(c => c.className)).toEqual(['panel-header']);
        });

        it('stays mounted while the sheet is folded; the stylesheet hides it with the body', async () => {
            const wrapper = withTools();
            await wrapper.find('.sheet-toggle').trigger('click');
            expect(wrapper.find('.panel-tools .tool-btn').exists()).toBe(true);
            const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
            const phone = mediaBlock(scss, 'max-width: 767.98px');
            const folded = phone.slice(phone.indexOf('&.is-minimised {'));
            // Only the header shows: everything but the top block goes, and the tool bar inside it
            expect(folded).toMatch(/> :not\(\.panel-top\)\s*\{\s*display:\s*none/);
            expect(folded).toMatch(/> \.panel-top > \.panel-tools\s*\{\s*display:\s*none/);
            expect(folded).toMatch(/> \.panel-top > \.panel-header\s*\{\s*border-bottom:\s*0/);
        });
    });

    describe('the measured reserves', () => {
        const HEIGHTS = { 'panel-top': 96.2, 'panel-actions': 44 };
        const measured = (heights = HEIGHTS) => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
            const key = Object.keys(heights).find(k => this.classList.contains(k));
            return { height: key ? heights[key] : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
        });
        const panel = (slots = {}) => mount(AnalysisPanel, {
            props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health' },
            slots: { default: '<div class="panel-body">body</div>', ...slots }
        });
        const variable = (wrapper, name) => wrapper.element.style.getPropertyValue(name);
        afterEach(() => vi.restoreAllMocks());

        it('are set inline on the root from the heights of the top block and the footer, rounded up', async () => {
            measured();
            const wrapper = panel({ tools: '<button class="tool-btn">Profile</button>', actions: '<div class="panel-footer-row" />' });
            await flushPromises();
            expect(variable(wrapper, '--panel-top-reserve')).toBe('97px');
            expect(variable(wrapper, '--panel-actions-reserve')).toBe('44px');
            expect(wrapper.classes()).toContain('has-actions');
        });

        it('are 0 for a footer the panel does not have, and the class says so', async () => {
            measured();
            const wrapper = panel();
            await flushPromises();
            expect(variable(wrapper, '--panel-top-reserve')).toBe('97px');
            expect(variable(wrapper, '--panel-actions-reserve')).toBe('0px');
            expect(wrapper.classes()).not.toContain('has-actions');
        });

        it('follow the blocks when they change height (a tool bar that wraps, a footer that grows)', async () => {
            const heights = { ...HEIGHTS };
            measured(heights);
            const wrapper = panel({ actions: '<div class="panel-footer-row" />' });
            heights['panel-top'] = 135;
            heights['panel-actions'] = 80;
            await wrapper.trigger('scroll');
            await flushPromises();
            expect(variable(wrapper, '--panel-top-reserve')).toBe('135px');
            expect(variable(wrapper, '--panel-actions-reserve')).toBe('80px');
        });

        it('keep the classes the panel is given and the style the host gives it', async () => {
            measured();
            const wrapper = mount(AnalysisPanel, {
                props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health' },
                attrs: { style: 'width: 20rem' },
                slots: { default: '<div class="panel-body" />' }
            });
            await flushPromises();
            expect(wrapper.element.style.width).toBe('20rem');
            expect(variable(wrapper, '--panel-top-reserve')).toBe('97px');
        });

        it('are the scroll padding of the panel: the top one always, the bottom one only with a footer', () => {
            const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
            const root = ruleOf(scss, '.analysis-panel');
            expect(root).toMatch(/scroll-padding-top:\s*var\(--panel-top-reserve, 0px\)/);
            expect(root).not.toMatch(/scroll-padding-bottom:\s*var\(--panel-actions-reserve\);/);
            expect(ruleOf(root, '&.has-actions')).toMatch(/scroll-padding-bottom:\s*calc\(var\(--panel-actions-reserve, 0px\) \+ var\(--panel-actions-fade\)\)/);
            // No panel has a reserve of its own: they are measured
            expect(scss).not.toMatch(/--panel-actions-reserve:/);
        });
    });

    describe('the actions slot', () => {
        const withActions = () => mount(AnalysisPanel, {
            props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health' },
            slots: { default: '<div class="panel-body">body</div>', actions: '<div class="actions-grid"><button class="act">Export</button></div>' }
        });

        it('renders the slot in the footer, after the body', () => {
            const wrapper = withActions();
            const footer = wrapper.get('[data-testid="panel-actions"]');
            expect(footer.classes()).toContain('panel-actions');
            expect(footer.find('.act').text()).toBe('Export');
            const children = [...wrapper.element.children].map(c => c.className.split(' ')[0]);
            expect(children).toEqual(['panel-top', 'panel-body', 'panel-actions']);
        });

        it('has no footer without the slot', () => {
            expect(mountPanel().find('.panel-actions').exists()).toBe(false);
        });

        it('keeps the footer in the folded sheet, which the stylesheet hides, and mounted', async () => {
            const wrapper = withActions();
            await wrapper.find('.sheet-toggle').trigger('click');
            expect(wrapper.find('.panel-actions').exists()).toBe(true);
        });

        it('is sticky at the bottom of the panel on the solid colour, whichever screen', () => {
            const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
            const footer = ruleOf(scss, '.panel-actions');
            expect(footer).toMatch(/position:\s*sticky/);
            expect(footer).toMatch(/bottom:\s*0/);
            expect(footer).toMatch(/background:\s*var\(--panel-bg-solid\)/);
        });

        it('is one wrapping flex row of footer buttons, 2rem high, with the primary one pushed to the right end', () => {
            const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
            const row = ruleOf(scss, '.panel-footer-row');
            expect(row).toMatch(/display:\s*flex/);
            expect(row).toMatch(/flex-wrap:\s*wrap/);
            expect(row).toMatch(/gap:/);
            expect(ruleOf(scss, '.tool-btn,\n    .footer-btn')).toMatch(/min-height:\s*2rem/);
            expect(ruleOf(scss, '.footer-btn--end')).toMatch(/margin-left:\s*auto/);
            // The status of a task takes a row of its own above the buttons
            const status = ruleOf(scss, '.footer-status');
            expect(status).toMatch(/flex-basis:\s*100%/);
            expect(status).toMatch(/order:\s*-1/);
        });

        it('keeps its padding and stays in view on the phone sheet, which does not change its position', () => {
            const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
            const phone = mediaBlock(scss, 'max-width: 767.98px');
            expect(ruleOf(phone, '.panel-actions')).not.toMatch(/position:/);
            expect(ruleOf(phone, '.panel-actions')).toMatch(/padding:/);
            // The buttons of the older footer grid keep their short form there
            const button = ruleOf(phone, '.action-btn');
            expect(button).toMatch(/flex-direction:\s*row/);
            expect(button).toMatch(/min-height:\s*2rem/);
        });

        it('fades the body above the footer only while more of it is hidden below', async () => {
            const wrapper = withActions();
            const el = wrapper.element;
            const sizes = { scrollHeight: 900, clientHeight: 400, scrollTop: 0 };
            for (const [key, value] of Object.entries(sizes)) Object.defineProperty(el, key, { configurable: true, writable: true, value });
            await wrapper.trigger('scroll');
            expect(wrapper.get('.panel-actions').classes()).toContain('has-more');

            // Scrolled to the end: nothing is hidden under the footer
            el.scrollTop = 500;
            await wrapper.trigger('scroll');
            expect(wrapper.get('.panel-actions').classes()).not.toContain('has-more');

            // The body fits
            el.scrollTop = 0;
            el.scrollHeight = 400;
            await wrapper.trigger('scroll');
            expect(wrapper.get('.panel-actions').classes()).not.toContain('has-more');
        });
    });

    describe('narrow panels', () => {
        const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');

        it('makes the panel the container its tool bar and footer query', () => {
            expect(ruleOf(scss, '.analysis-panel')).toMatch(/container:\s*analysis-panel\s*\/\s*inline-size/);
        });

        // The width of the panel in the mockups (18vw of a 1920px screen), in rem
        const MOCKUP_WIDTH = 345 / 16;
        // Every `@container analysis-panel (width < Xrem)` block: its width in rem and its text
        const narrowBlocks = [...scss.matchAll(/@container analysis-panel \(width < ([\d.]+)rem\) \{/g)]
            .map(([, width]) => ({ width: Number(width), block: containerBlock(scss, 'analysis-panel', `width < ${width}rem`) }));
        // The width below which a rule written `selector {` applies, undefined when no container query has it
        const widthOf = selector => narrowBlocks.find(({ block }) => block.includes(`${selector} {`))?.width;

        it('is one row of tools as wide as their labels, the width left over shared between them', () => {
            const tools = ruleOf(scss, '.panel-tools');
            expect(tools).toMatch(/display:\s*flex/);
            expect(tools).not.toMatch(/grid-auto-columns|1fr/);
            expect(ruleOf(scss, '> .tool-btn')).toMatch(/flex:\s*1 1 auto/);
            // The tool the map is in, whose label can be longer, is the one that gives way on a row just wide enough
            expect(ruleOf(scss, '> .tool-btn:not(.is-active)')).toMatch(/flex-shrink:\s*0/);
            // In the font of the panel, the one the widths of the queries are measured in: every .panel-btn has it, the
            // tools and the footer buttons among them, so the buttons of a panel share one font
            expect(ruleOf(scss, '.panel-btn')).toMatch(/font-family:\s*inherit/);
            expect(ruleOf(scss, '.tool-btn,\n    .footer-btn')).not.toMatch(/font-family/);
        });

        it('puts the tools in two columns, labels kept, only below the width the tools of that panel need', () => {
            const twoColumns = ruleOf(scss, '@mixin two-columns-of-tools');
            expect(twoColumns).toMatch(/display:\s*grid/);
            expect(twoColumns).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
            // A width per panel, measured from its own labels: Raster Analysis 330px, Stockpile Volume 334px
            expect(widthOf('.analysis-panel--raster .panel-tools')).toBe(20.625);
            expect(widthOf('.analysis-panel--stockpile .panel-tools')).toBe(21);
            for (const variant of ['raster', 'stockpile']) {
                const width = widthOf(`.analysis-panel--${variant} .panel-tools`);
                const block = narrowBlocks.find(b => b.width === width).block;
                expect(ruleOf(block, `.analysis-panel--${variant} .panel-tools`)).toMatch(/@include two-columns-of-tools/);
                // One row on the panel of the mockups, two columns on the narrowest panel
                expect(width).toBeLessThanOrEqual(MOCKUP_WIDTH);
                expect(width).toBeGreaterThan(16);
            }
            // No rule for every panel at once, and the label is never hidden in the tool bar
            for (const { block } of narrowBlocks) {
                expect(block).not.toMatch(/^\s*(\.analysis-panel )?\.panel-tools \{/m);
                expect(block).not.toMatch(/\.tool-label/);
            }
        });

        it('shows the footer buttons beside the primary one as icons only below the width the footer of that panel needs, the label kept for the reader', () => {
            const hidden = ruleOf(scss, '@mixin footer-labels-hidden');
            expect(hidden).toMatch(/\.footer-btn:not\(\.footer-btn--end\) \.footer-label \{/);
            expect(hidden).toMatch(/position:\s*absolute/);
            expect(hidden).toMatch(/width:\s*1px/);
            expect(hidden).toMatch(/clip:\s*rect\(0, 0, 0, 0\)/);
            expect(hidden).not.toMatch(/display:\s*none/);
            // Not the primary button, whose label stays
            expect(scss).not.toMatch(/\.footer-btn--end \.footer-label/);
            // Raster Analysis (Reset, Hide orig., Export) 281px, Plant Health (and Link) 343px; Stockpile Volume has no footer
            expect(widthOf('.analysis-panel--raster')).toBe(17.625);
            expect(widthOf('.analysis-panel--plant-health')).toBe(21.5);
            expect(widthOf('.analysis-panel--stockpile')).toBeUndefined();
            for (const variant of ['raster', 'plant-health']) {
                const width = widthOf(`.analysis-panel--${variant}`);
                const block = narrowBlocks.find(b => b.width === width).block;
                expect(ruleOf(block, `.analysis-panel--${variant}`)).toMatch(/@include footer-labels-hidden/);
                // Every label on the panel of the mockups
                expect(width).toBeLessThanOrEqual(MOCKUP_WIDTH);
            }
            // No rule for every panel at once
            for (const { block } of narrowBlocks) expect(block).not.toMatch(/^\s*(\.analysis-panel )?\.footer-btn/m);
            // The buttons are close enough for the four of Plant Health to fit it
            expect(ruleOf(scss, '.panel-footer-row')).toMatch(/gap:\s*0\.25rem/);
            expect(scss).toMatch(/\.footer-btn \{\s*position:\s*relative;\s*padding:\s*0 0\.3125rem;/);
        });

        it('has no fixed width wider than the panel in the shared rows', () => {
            expect(scss).not.toMatch(/overflow-x:\s*auto/);
            expect(ruleOf(scss, '.panel-row')).toMatch(/grid-template-columns:\s*var\(--panel-label-width\) minmax\(0, 1fr\)/);
            expect(ruleOf(scss, '.panel-row--stacked')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
        });
    });
});
