import reg from '../libs/sharedRegistry';

// Change both slug and set meta name
export async function renameDataset(orgSlug, dsSlug, name){
    const ds = reg.Organization(orgSlug).Dataset(dsSlug);

    if (name.length > 128) name = name.slice(0, 128);

    let slug = name.toLowerCase();
    slug = slug.replace(/ /g, "-");
    slug = slug.replace(/[^a-z0-9_-]/g, "");
    while(slug.startsWith("_") || slug.startsWith("-")) slug = slug.slice(1);

    await ds.metaSet("name", name);
    return await ds.rename(slug);
};

export function datasetName(ds){
    return ds.properties.meta?.name?.data || ds.slug;
}

