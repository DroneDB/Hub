// @ts-check
/**
 * What the (i) button of a group under the folder tree of the dataset page explains: what the items of the group are,
 * how to make one, how to use them, and the documentation page. The shape of InfoDialog's props.
 */
import { DOCS } from './docsLinks';
import { VIEWS_ICON, REPORT_ICON } from './glyphs';

/**
 * @typedef {Object} GroupInfo
 * @property {string} id       the DOM id of the dialog
 * @property {string} title
 * @property {string} icon
 * @property {string} summary
 * @property {{ heading: string, text?: string, items?: string[] }[]} sections
 * @property {string} docsUrl
 */

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
                'Open a georaster on the map, add layers with Add layer, then click Save in the bar above the map and type a name.',
                'On the Map tab of the dataset, click Save as view to save the georasters it shows.',
                'A new report can save the map as it is now as a view.',
                'Saving, renaming and deleting views needs write access.'
            ]
        },
        {
            heading: 'Use a view',
            items: [
                'Double-click a view, or select it and press Enter, to open it in a new tab.',
                'Right-click a view to open it, copy its link, rename it or delete it.',
                'After a change on the map, Save replaces the view and Save as new keeps it and saves a copy.',
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
                'Click New report below, or Report in the toolbar of the map.',
                'Hub fills in the name, the measurement files and the view of the maps. Change them if needed, then click Create report.',
                'More options holds the template, the title, the units, the filter and the sections.',
                'Making and editing reports needs write access and a saved measurements file in the dataset.'
            ]
        },
        {
            heading: 'Use a report',
            items: [
                'Double-click a report, or select it and press Enter, to open it in a new tab.',
                'Right-click a report to open it, copy its link, edit it, duplicate it or delete it.',
                'On the report page, Download PDF saves a PDF; Publish PDF writes it in the reports folder of the dataset.',
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
