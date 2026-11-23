// @ts-check
/**
 * What the (i) button of a group under the folder tree of the dataset page explains: what the items of the group are,
 * how to make one, how to use them, and the documentation page. The shape of InfoDialog's props. A line names each
 * button it tells the user to press with the icon and the label of that button, so the user knows what to look for.
 */
import { DOCS } from './docsLinks';
import { VIEWS_ICON, REPORT_ICON, SAVE_ICON, COPY_LINK_ICON, DELETE_ICON } from './glyphs';

/**
 * The icons of the menu and the add button of the groups (SavedViews, ReportsList, SidebarGroup use them), so the
 * dialogs show the icons the rows show.
 */
export const GROUP_ACTION_ICONS = Object.freeze({
    open: 'fa-regular fa-folder-open',
    copyLink: COPY_LINK_ICON,
    rename: 'fa-solid fa-pen',
    edit: 'fa-solid fa-pen',
    duplicate: 'fa-regular fa-copy',
    delete: DELETE_ICON,
    add: 'fa-solid fa-plus'
});

/**
 * The icons of the buttons of the map viewer and the report page that the dialogs name; the components that draw
 * those buttons are checked against them (datasetGroupInfo.spec).
 */
export const BUTTON_ICONS = Object.freeze({
    addLayer: 'fa-solid fa-plus',
    saveAsNewView: 'fa-solid fa-copy',
    downloadPdf: 'fa-solid fa-file-pdf',
    publishPdf: 'fa-solid fa-cloud-arrow-up'
});

/**
 * A button or menu item named in a line: its label in bold, after its icon when it has one.
 * @param {string} label
 * @param {string} [icon]
 * @returns {{ label: string, icon?: string }}
 */
export const ui = (label, icon) => (icon ? { label, icon } : { label });

/**
 * @typedef {string | (string | { label: string, icon?: string })[]} InfoLine  plain text, or text and buttons
 * @typedef {Object} GroupInfo
 * @property {string} id       the DOM id of the dialog
 * @property {string} title
 * @property {string} icon
 * @property {string} summary
 * @property {{ heading: string, text?: InfoLine, items?: InfoLine[] }[]} sections
 * @property {string} docsUrl
 */

const I = GROUP_ACTION_ICONS;
const B = BUTTON_ICONS;

/** @type {Readonly<GroupInfo>} */
export const SAVED_VIEWS_INFO = Object.freeze({
    id: 'saved-views-info',
    title: 'About views',
    icon: VIEWS_ICON,
    summary: 'A view is a map of this dataset saved under a name: up to six georasters from any folder, with their order, '
        + 'opacity and Plant Health settings, the split, the map position, the basemap and the elevation model. '
        + 'It opens again from a short link, and reports use views for their maps.',
    sections: [
        {
            heading: 'Make a view',
            items: [
                ['Open a georaster on the map, add layers with ', ui('Add layer', B.addLayer), ' in the layer panel, then click ',
                    ui('Save view', SAVE_ICON), ' in the bar above the map and type a name.'],
                ['On the Map tab of the dataset, click ', ui('Save as view', VIEWS_ICON), ' in the map toolbar to save the georasters it shows.'],
                'A new report can save the map as it is now as a view.',
                'Saving, renaming and deleting views needs write access.'
            ]
        },
        {
            heading: 'Use a view',
            items: [
                'Double-click a view, or select it and press Enter, to open it in a new tab.',
                ['Right-click a view for ', ui('Open', I.open), ', ', ui('Copy Link', I.copyLink), ', ', ui('Rename', I.rename), ' and ',
                    ui('Delete', I.delete), '.'],
                ['After a change on the map, ', ui('Save view', SAVE_ICON), ' replaces the view and ', ui('Save as new view'),
                    ' keeps it and saves a copy (on a phone both are in the ', ui('View actions', 'fa-solid fa-ellipsis-vertical'), ' menu).'],
                'Deleting a view does not delete its files; its links stop working.'
            ]
        },
        {
            heading: 'Who can open it',
            text: 'Everyone who can open the dataset can open its views and copy their links.'
        }
    ],
    docsUrl: DOCS.savedViews
});

/** @type {Readonly<GroupInfo>} */
export const REPORTS_INFO = Object.freeze({
    id: 'reports-info',
    title: 'About reports',
    icon: REPORT_ICON,
    summary: 'A report turns the measurements and annotations of this dataset into a page with its own link: a cover map, '
        + 'a summary, tables and a section for each item with its map, values and photos. It shows the measurements as '
        + 'they are now, and gives a PDF to download or to publish in the dataset.',
    sections: [
        {
            heading: 'Make a report',
            items: [
                ['Click ', ui('New report', I.add), ' below, or ', ui('Report', REPORT_ICON), ' in the toolbar of the map.'],
                ['Hub fills in the name, the measurement files and the view of the maps. Change them if needed, then click ',
                    ui('Create report'), '.'],
                [ui('More options'), ' holds the template, the title, the units, the filter and the sections.'],
                'Making and editing reports needs write access and a saved measurements file in the dataset.'
            ]
        },
        {
            heading: 'Use a report',
            items: [
                'Double-click a report, or select it and press Enter, to open it in a new tab.',
                ['Right-click a report for ', ui('Open', I.open), ', ', ui('Copy Link', I.copyLink), ', ', ui('Edit', I.edit), ', ',
                    ui('Duplicate', I.duplicate), ' and ', ui('Delete', I.delete), '.'],
                ['On the report page, ', ui('Download PDF', B.downloadPdf), ' saves a PDF and ', ui('Publish PDF', B.publishPdf),
                    ' writes it in the reports folder of the dataset.'],
                'Deleting a report does not delete its measurement files or its published PDFs.'
            ]
        },
        {
            heading: 'Who can open it',
            text: 'A report follows the visibility of the dataset: everyone who can open the dataset can open its reports '
                + 'and download their PDF.'
        }
    ],
    docsUrl: DOCS.reports
});
