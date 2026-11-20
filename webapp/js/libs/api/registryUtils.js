import reg from '@/libs/api/sharedRegistry';
import { suggestSlug } from '@/libs/slug';
import { displayNameLimits } from '@/libs/nameRules';

// Change both slug and set meta name
export async function renameDataset(orgSlug, dsSlug, name) {
    const ds = reg.Organization(orgSlug).Dataset(dsSlug);

    // The Registry's limit of a name (published, FR-ORG-14)
    const max = displayNameLimits().max;
    if (name.length > max) name = name.slice(0, max);

    // A name with no Latin letter or digit makes no slug: the dataset keeps its own and only the name changes (D-035)
    const slug = suggestSlug(name) || dsSlug;

    // The slug first: a slug that is taken or refused changes nothing (the name stays as it was)
    const renamed = slug === dsSlug ? null : await ds.rename(slug);
    const newSlug = renamed?.slug || slug;
    await reg.Organization(orgSlug).Dataset(newSlug).metaSet("name", name);
    return renamed || { slug: newSlug };
};

export function datasetName(ds) {
    return ds.properties.meta?.name?.data || ds.slug;
}
