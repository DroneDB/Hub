/**
 * copyLinkWithNotice: every Copy Link says that the link was copied, or that it could not be (FR-RAS-05).
 */
import { describe, it, expect, vi } from 'vitest';

const clipboard = vi.hoisted(() => vi.fn());
vi.mock('clipboard-copy', () => ({ default: clipboard }));

const { copyLinkWithNotice } = await import('./useCopyText');

describe('copyLinkWithNotice', () => {
    it('copies the link and says so', async () => {
        clipboard.mockResolvedValueOnce(undefined);
        const notify = { success: vi.fn(), error: vi.fn() };
        expect(await copyLinkWithNotice('https://hub/a#b', notify, 'Plant Health')).toBe(true);
        expect(clipboard).toHaveBeenCalledWith('https://hub/a#b');
        expect(notify.success).toHaveBeenCalledWith('Link copied to the clipboard', { summary: 'Plant Health' });
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('says when the link could not be copied', async () => {
        clipboard.mockRejectedValueOnce(new Error('denied'));
        const notify = { success: vi.fn(), error: vi.fn() };
        expect(await copyLinkWithNotice('x', notify)).toBe(false);
        expect(notify.error).toHaveBeenCalledWith('The link could not be copied', undefined);
        expect(notify.success).not.toHaveBeenCalled();
    });
});
