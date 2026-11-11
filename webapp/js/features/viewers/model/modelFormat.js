// @ts-check
/**
 * Which format a model entry's build made the model in, from the artifacts it lists.
 */
import { ArtifactRole, findArtifactIn } from '@/libs/ddb/buildArtifacts';

/**
 * Whether the model is a Nexus one (a build that predates bm3d): the entry lists that role and not
 * the bm3d one. libddb lists the two for one entry never, so this is not a preference order but
 * a guard for a listing that has both.
 * @param {{ artifacts?: import('@/libs/ddb/buildArtifacts').BuildArtifact[] } | null | undefined} entry
 * @returns {boolean}
 */
export function usesLegacyNexus(entry) {
    return !findArtifactIn(entry, ArtifactRole.MODEL_BM3D) && !!findArtifactIn(entry, ArtifactRole.MODEL_NEXUS);
}
