import reg from '../libs/sharedRegistry';

// Change both slug and set meta name
export async function renameDataset(orgSlug, dsSlug, name) {
    const ds = reg.Organization(orgSlug).Dataset(dsSlug);

    if (name.length > 128) name = name.slice(0, 128);

    let slug = slugFromName(name);

    if (!slug)
        throw new Error("Invalid name: cannot generate valid slug");

    await ds.metaSet("name", name);
    return await ds.rename(slug);
};

export function datasetName(ds) {
    return ds.properties.meta?.name?.data || ds.slug;
}

export function slugFromName(name) {
    if (!name) return null;

    let slug = name.toLowerCase();
    slug = slug.replace(/ /g, "-");
    slug = slug.replace(/[^a-z0-9_-]/g, "");
    slug = slug.replace(/-+/g, "-"); // Collapse consecutive dashes
    while (slug.startsWith("_") || slug.startsWith("-")) slug = slug.slice(1);
    while (slug.endsWith("-")) slug = slug.slice(0, -1); // Remove trailing dashes
    if (slug.length > 128) slug = slug.slice(0, 128); // Max length 128
    if (slug.length === 0) return null; // Empty slug is invalid
    return slug;
}
