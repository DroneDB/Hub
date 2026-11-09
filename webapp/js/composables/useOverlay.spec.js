/**
 * The overlay stack (FR-XC-19): the focus target on open (FR-XC-02), the return to the opener
 * on close (FR-XC-03), and Escape for the topmost overlay only, unless an open Select or menu
 * in it (ARIA state) keeps the key.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useOverlay, focusTargetIn, hasOpenOverlay } from './useOverlay';

const Overlay = defineComponent({
    props: {
        active: { type: Boolean, default: true },
        danger: { type: Boolean, default: false },
        autoFocus: { type: Boolean, default: false },
        html: { type: String, default: '' }
    },
    emits: ['escape'],
    setup(props, { emit, expose }) {
        const el = ref(null);
        const api = useOverlay({
            active: () => props.active, container: () => el.value, danger: () => props.danger,
            onEscape: e => emit('escape', e), autoFocus: props.autoFocus
        });
        expose(api);
        return () => (props.active ? h('div', { ref: el, class: 'overlay', innerHTML: props.html }) : null);
    }
});

const mounted = [];
const open = async (props = {}) => {
    const w = mount(Overlay, { props, attachTo: document.body });
    mounted.push(w);
    await nextTick();
    return w;
};
const page = html => {
    const div = document.createElement('div');
    div.className = 'page';
    div.innerHTML = html;
    document.body.appendChild(div);
    return div;
};
const escape = (target = document.activeElement || document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount());
    document.body.innerHTML = '';
});

describe('focusTargetIn (FR-XC-02)', () => {
    const root = html => page(html);

    it('skips a field that is not rendered (a hidden tab panel) and takes the visible one', () => {
        const r = root('<div style="display: none"><input class="hidden"></div><div hidden><input class="hidden2"></div><input class="shown">');
        expect(focusTargetIn(r).className).toBe('shown');
    });

    it('takes the first focusable element of a [data-autofocus] wrapper', () => {
        const r = root('<input class="name"><div data-autofocus><span class="label">Org</span><span role="combobox" tabindex="0" class="combo"></span></div>');
        expect(focusTargetIn(r).className).toBe('combo');
    });

    it('starts a destructive confirmation on Cancel, before a field; a typed confirmation ([data-autofocus]) before Cancel', () => {
        const r = root('<input class="name"><button data-cancel>Cancel</button><button data-confirm>Delete</button>');
        expect(focusTargetIn(r, { danger: true }).hasAttribute('data-cancel')).toBe(true);
        const typed = root('<input class="typed" data-autofocus><button data-cancel>Cancel</button>');
        expect(focusTargetIn(typed, { danger: true }).className).toBe('typed');
    });

    it('takes the confirm button of a dialog without a field, else the first visible, enabled control', () => {
        expect(focusTargetIn(root('<button class="other">Help</button><button data-confirm>OK</button>')).hasAttribute('data-confirm')).toBe(true);
        expect(focusTargetIn(root('<button disabled>No</button><span style="display:none"><button>Hidden</button></span><button role="tab" tabindex="-1">Off</button><button class="tab" role="tab">On</button>')).className).toBe('tab');
    });

    it('skips a disabled or read-only field and a disabled Select', () => {
        const r = root('<input disabled><input readonly><span role="combobox" aria-disabled="true" tabindex="-1"></span><textarea class="notes"></textarea>');
        expect(focusTargetIn(r).className).toBe('notes');
    });
});

describe('useOverlay focus', () => {
    it('focuses the target of a shown overlay (autoFocus), else the overlay itself', async () => {
        await open({ html: '<button class="close">Close</button>', autoFocus: true });
        await nextTick();
        expect(document.activeElement.className).toBe('close');
        const empty = await open({ html: '<p>Nothing to focus</p>' });
        expect(empty.vm.focusInitial()).toBe(document.querySelectorAll('.overlay')[1]);
        expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
    });

    it('gives the focus back to the control that opened it (FR-XC-03)', async () => {
        const opener = page('<button class="opener">Open</button>').querySelector('button');
        opener.focus();
        const w = await open({ html: '<input class="name">' });
        w.vm.focusInitial();
        expect(document.activeElement.className).toBe('name');
        await w.setProps({ active: false });
        expect(document.activeElement).toBe(opener);
    });

    it('gives it to the page h1 when the opener is gone, and the h1 becomes focusable', async () => {
        const host = page('<h1>Datasets</h1><button class="opener">Open</button>');
        host.querySelector('.opener').focus();
        const w = await open({ html: '<input class="name">' });
        w.vm.focusInitial();
        host.querySelector('.opener').remove();
        w.unmount();
        mounted.splice(mounted.indexOf(w), 1);
        expect(document.activeElement.tagName).toBe('H1');
        expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
    });

    it('leaves the focus where the user put it outside the overlay', async () => {
        const host = page('<button class="opener">Open</button><input class="search">');
        host.querySelector('.opener').focus();
        const w = await open({ html: '<input class="name">' });
        host.querySelector('.search').focus();
        await w.setProps({ active: false });
        expect(document.activeElement.className).toBe('search');
    });

    it('takes the control focused before a menu as the opener of what the menu opens', async () => {
        const host = page('<button class="trigger">Account</button><ul role="menu" tabindex="0"><li role="menuitem">Preferences</li></ul>');
        host.querySelector('.trigger').focus();
        host.querySelector('[role="menu"]').focus();
        const w = await open({ html: '<input class="name">' });
        w.vm.focusInitial();
        host.querySelector('[role="menu"]').remove();
        await w.setProps({ active: false });
        expect(document.activeElement.className).toBe('trigger');
    });

    it('keeps the focus inside when the menu that opened it takes it back after its command', async () => {
        const trigger = page('<button class="trigger">Tools</button>').querySelector('button');
        trigger.focus();
        const w = await open({ html: '<input class="name">' });
        w.vm.focusInitial();
        // PrimeVue's Menu focuses its trigger on Enter, around the command that opened the dialog
        trigger.focus();
        await frame();
        expect(document.activeElement.className).toBe('name');
        await w.setProps({ active: false });
        expect(document.activeElement).toBe(trigger);
    });
});

describe('useOverlay Escape', () => {
    it('closes only the topmost overlay', async () => {
        const lower = await open({ html: '<input class="lower">' });
        const upper = await open({ html: '<input class="upper">' });
        escape();
        expect(upper.emitted('escape')).toHaveLength(1);
        expect(lower.emitted('escape')).toBeUndefined();
        await upper.setProps({ active: false });
        escape();
        expect(lower.emitted('escape')).toHaveLength(1);
    });

    it('leaves the key to an open Select (aria-expanded), and closes with a closed one', async () => {
        const w = await open({ html: '<span role="combobox" tabindex="0" aria-expanded="true"></span>' });
        const combo = document.querySelector('[role="combobox"]');
        combo.focus();
        escape(combo);
        expect(w.emitted('escape')).toBeUndefined();
        combo.setAttribute('aria-expanded', 'false');
        escape(combo);
        expect(w.emitted('escape')).toHaveLength(1);
    });

    it('leaves Escape to a [data-owns-escape] control (a search field clears its query), and closes from elsewhere', async () => {
        const w = await open({ html: '<span data-owns-escape><input class="search"></span><input class="name">' });
        const search = document.querySelector('.search');
        search.focus();
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        search.dispatchEvent(event);
        expect(w.emitted('escape')).toBeUndefined();
        expect(event.defaultPrevented).toBe(false);
        const name = document.querySelector('.name');
        name.focus();
        escape(name);
        expect(w.emitted('escape')).toHaveLength(1);
    });

    it('does not let a [data-owns-escape] control outside the overlay keep the key', async () => {
        const w = await open({ html: '<input>' });
        const outside = page('<input data-owns-escape class="page-search">').querySelector('input');
        escape(outside);
        expect(w.emitted('escape')).toHaveLength(1);
    });

    it('decides before a control that stops the key (PrimeVue Select stops every Escape)', async () => {
        const w = await open({ html: '<span role="combobox" tabindex="0" aria-expanded="false"></span>' });
        const combo = document.querySelector('[role="combobox"]');
        combo.addEventListener('keydown', e => e.stopPropagation());
        combo.focus();
        escape(combo);
        expect(w.emitted('escape')).toHaveLength(1);
    });

    it('leaves the key to a menu opened from the overlay (its list outside it has the focus)', async () => {
        const w = await open({ html: '<button aria-haspopup="menu" aria-expanded="false">More</button>' });
        const list = page('<ul role="menu" tabindex="0"><li role="menuitem">Item</li></ul>').querySelector('ul');
        list.focus();
        escape(list);
        expect(w.emitted('escape')).toBeUndefined();
    });

    it('closes on an Escape from elsewhere in the page (focus left on a closed element)', async () => {
        const w = await open({ html: '<input>' });
        const link = page('<a href="#x">x</a>').querySelector('a');
        link.addEventListener('keydown', e => e.preventDefault());
        escape(link);
        expect(w.emitted('escape')).toHaveLength(1);
    });

    it('ignores other keys and Escape while composing text', async () => {
        const onKey = vi.fn();
        const w = await open({ html: '<input>' });
        document.addEventListener('keydown', onKey);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }));
        document.removeEventListener('keydown', onKey);
        expect(w.emitted('escape')).toBeUndefined();
        expect(onKey).toHaveBeenCalledTimes(2);
    });

    it('is empty once every overlay is gone', async () => {
        const w = await open({});
        expect(hasOpenOverlay()).toBe(true);
        w.unmount();
        mounted.splice(mounted.indexOf(w), 1);
        expect(hasOpenOverlay()).toBe(false);
    });
});
