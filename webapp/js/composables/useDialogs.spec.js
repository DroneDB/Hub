import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { useDialogs } from './useDialogs';
import DialogHost from '@/components/DialogHost.vue';

const Echo = defineComponent({
    props: { text: { type: String, default: '' } },
    emits: ['onClose', 'onSave'],
    setup(props, { emit }) {
        return () => h('div', { class: 'echo' }, [
            h('button', { class: 'save', onClick: () => emit('onSave', props.text) }),
            h('button', { class: 'close', onClick: () => emit('close', 'done') })
        ]);
    }
});

describe('useDialogs + DialogHost', () => {
    it('renders an opened dialog in the app and resolves when it closes', async () => {
        let dialogs;
        const wrapper = mount({ components: { DialogHost }, setup() { dialogs = useDialogs(); return { dialogs }; }, template: '<DialogHost :dialogs="dialogs" />' });
        const onSave = vi.fn();
        const result = dialogs.open(Echo, { text: 'hi', onOnSave: onSave });
        await nextTick();
        await wrapper.find('.save').trigger('click');
        expect(onSave).toHaveBeenCalledWith('hi');
        await wrapper.find('.close').trigger('click');
        await expect(result).resolves.toBe('done');
        expect(wrapper.find('.echo').exists()).toBe(false);
    });

    it('closes named dialogs programmatically', async () => {
        const dialogs = useDialogs();
        const p = dialogs.open('rename', { path: 'a.jpg' });
        expect(dialogs.stack.value.map(d => d.name)).toEqual(['rename']);
        expect(dialogs.isOpen('rename')).toBe(true);
        dialogs.close('rename', 'b.jpg');
        await expect(p).resolves.toBe('b.jpg');
        expect(dialogs.stack.value).toEqual([]);
    });
});
