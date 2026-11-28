import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SplatCameraRail from './SplatCameraRail.vue';
import CameraManager from './CameraManager.vue';
import { cameraIndexOfCode } from './splatKeys';

const cameras = [{ id: 'a', name: 'Door' }, { id: 'b', name: 'Window' }, { id: 'c', name: 'Roof' }];

describe('camera numbers', () => {
    it('the rail labels the first camera 1, and the key of that number calls it', () => {
        const rail = mount(SplatCameraRail, { props: { cameras, activeIndex: null } });
        const labels = rail.findAll('.rail-btn.cam').map(b => b.text());
        expect(labels).toEqual(['1', '2', '3']);
        // The key labelled 1 calls the camera of the first button
        expect(cameraIndexOfCode('Digit1')).toBe(0);
        rail.findAll('.rail-btn.cam')[0].trigger('click');
        expect(rail.emitted('goto')[0]).toEqual([0]);
    });

    it('the camera manager shows the same numbers, and tells which key calls a camera', () => {
        const manager = mount(CameraManager, {
            props: { cameras, canWrite: true, dirty: false, activeIndex: null },
            global: { stubs: { Window: { template: '<div><slot /></div>' }, Button: true } }
        });
        const rows = manager.findAll('.saved-row');
        expect(rows.map(r => r.find('.idx').text())).toEqual(['1', '2', '3']);
        expect(rows[0].find('.idx').attributes('title')).toBe('Press 1 to jump here');
        expect(rows[0].find('input').attributes('aria-label')).toBe('Name of view 1');
        expect(manager.find('.hint').text()).toContain('1-9');
        expect(manager.find('.hint').text()).not.toContain('0-9');
    });

    it('the manager promises no key for a tenth camera', () => {
        const ten = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `c${i}` }));
        const manager = mount(CameraManager, {
            props: { cameras: ten, canWrite: false, dirty: false, activeIndex: null },
            global: { stubs: { Window: { template: '<div><slot /></div>' }, Button: true } }
        });
        const idx = manager.findAll('.saved-row')[9].find('.idx');
        expect(idx.text()).toBe('10');
        expect(idx.attributes('title')).toBeUndefined();
    });
});
