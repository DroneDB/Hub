import { describe, it, expect } from 'vitest';
import { effectScope } from 'vue';
import { useDialogs } from './useDialogs';
import { useConfirm } from './useConfirm';

describe('useConfirm', () => {
    it('resolves true only for confirm', async () => {
        const dialogs = effectScope().run(() => useDialogs());
        const confirm = useConfirm(dialogs);
        const yes = confirm({ message: 'Sure?', danger: true });
        expect(dialogs.stack.value[0].props).toMatchObject({ message: 'Sure?', confirmButtonClass: 'danger' });
        dialogs.close(dialogs.stack.value[0].id, 'confirm');
        await expect(yes).resolves.toBe(true);
        const no = confirm({ message: 'Sure?' });
        dialogs.close(dialogs.stack.value[0].id, 'cancel');
        await expect(no).resolves.toBe(false);
    });
});
