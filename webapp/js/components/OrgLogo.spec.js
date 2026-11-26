/**
 * OrgLogo: the image of the organization when it has a logo; its initials on the colour of its slug when it has none or
 * when the image does not load, the colour of the map's legend when one is given; alternative text unless the name is
 * beside it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import OrgLogo from './OrgLogo.vue';
import { organizationColour } from '@/libs/map/vectorColours';
import { initialsLook } from '@/libs/orgLogo';

let wrapper;
const render = props => (wrapper = mount(OrgLogo, { props }));
afterEach(() => wrapper?.unmount());

const acme = { slug: 'acme', name: 'Acme Drone Lab', logoUrl: '/orgs/acme/logo?v=1' };

describe('OrgLogo', () => {
    it('shows the image of the logo, with alternative text naming the organization', () => {
        render({ org: acme });
        const img = wrapper.find('img');
        expect(img.attributes('src')).toBe('/orgs/acme/logo?v=1');
        expect(img.attributes('alt')).toBe('Logo of Acme Drone Lab');
        expect(wrapper.find('.org-logo-initials').exists()).toBe(false);
    });

    it('shows the initials on its colour when there is no logo', () => {
        render({ org: { ...acme, logoUrl: null } });
        const tile = wrapper.find('.org-logo-initials');
        expect(wrapper.find('img').exists()).toBe(false);
        expect(tile.text()).toBe('AD');
        expect(tile.attributes('role')).toBe('img');
        expect(tile.attributes('aria-label')).toBe('Logo of Acme Drone Lab');
        const look = initialsLook(organizationColour('acme'));
        expect(tile.element.style.background).toBe(look.background);
        expect(tile.element.style.color).toBe(look.color);
    });

    it('falls back to the initials when the image does not load, and tries a new address again', async () => {
        render({ org: acme });
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('.org-logo-initials').text()).toBe('AD');

        await wrapper.setProps({ org: { ...acme, logoUrl: '/orgs/acme/logo?v=2' } });
        expect(wrapper.find('img').attributes('src')).toBe('/orgs/acme/logo?v=2');
    });

    it('has the same colour for the same slug, and another for another slug', () => {
        const colourOf = org => { render({ org: { ...org, logoUrl: null } }); const c = wrapper.find('.org-logo-initials').element.style.background; wrapper.unmount(); return c; };
        expect(colourOf({ slug: 'acme', name: 'One' })).toBe(colourOf({ slug: 'acme', name: 'Two' }));
        expect(colourOf({ slug: 'acme', name: 'x' })).not.toBe(colourOf({ slug: 'survey-team', name: 'x' }));
    });

    it('takes the colour it is given (the one of the pin in the legend of the map)', () => {
        render({ org: { ...acme, logoUrl: null }, colour: 'rgba(171, 71, 188, 0.8)' });
        expect(wrapper.find('.org-logo-initials').element.style.background).toBe('rgb(171, 71, 188)');
        expect(wrapper.find('.org-logo-initials').element.style.color).toBe('#ffffff');
    });

    it('names the slug when the organization has no name, and says what it is when it has neither', () => {
        render({ org: { slug: 'acme', logoUrl: '/x' } });
        expect(wrapper.find('img').attributes('alt')).toBe('Logo of acme');
        wrapper.unmount();
        render({ org: null });
        expect(wrapper.find('.org-logo-initials').attributes('aria-label')).toBe('Logo of the organization');
    });

    it('is for the eye only when the name is beside it: no alternative text, hidden from a screen reader', () => {
        render({ org: acme, decorative: true });
        expect(wrapper.find('img').attributes('alt')).toBe('');
        wrapper.unmount();
        render({ org: { ...acme, logoUrl: null }, decorative: true });
        const tile = wrapper.find('.org-logo-initials');
        expect(tile.attributes('aria-hidden')).toBe('true');
        expect(tile.attributes('role')).toBeUndefined();
    });

    it('has one tile per size', () => {
        for (const size of ['sm', 'md', 'lg']) {
            render({ org: acme, size });
            expect(wrapper.find('img').classes()).toContain(`org-logo-${size}`);
            wrapper.unmount();
        }
    });
});
