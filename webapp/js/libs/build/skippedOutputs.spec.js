/**
 * skippedOutputs: the output a model build could not generate, and why, read from its build log.
 */
import { describe, it, expect } from 'vitest';
import { skippedOutputOf } from './skippedOutputs';

const PATH = 'obj-edge-cases/blender/cubes_vertex_colors.obj';
// The log of the build of the visual check: bm3d made, 3D Tiles skipped (Obj2Tiles failed on the file)
const LOG = [
    `[19:39:51] In Build([dataset], ${PATH}, False)`,
    '[19:39:51] Running build',
    '[19:39:51] model',
    '[19:39:51] publishing',
    '[19:39:51] done (100%)',
    `[19:39:51] [ddb] 3D Tiles generation skipped for ${PATH}: Could not build 3D Tiles for /srv/storage/[dataset]/${PATH}: Obj2Tiles exited with code 1: \n *** OBJ to Tiles ***\n\n => Decimation stage with 1 LODs\n ?> Decimation done\n => Splitting stage with 0 divisions \n -> Pre-computing split plan from LOD-0 vertices\n !> Exception: Vertex color count (40) does not match vertex count (48). All vertices must have colors or none.\n\n => Pipeline failed in 00:00:00.0376772\n => Cleaning up\n`,
    '[19:39:51] Done build'
];

describe('skippedOutputOf', () => {
    it('names the output and the exception of the tool that failed', () => {
        expect(skippedOutputOf(LOG, PATH)).toEqual({
            output: '3D Tiles',
            reason: 'Vertex color count (40) does not match vertex count (48). All vertices must have colors or none.'
        });
    });

    it('gives the first line of the error without the server path when the tool reported no exception', () => {
        const line = `[10:00:00] [ddb] 3D Tiles generation skipped for ${PATH}: Could not build 3D Tiles for C:\\data\\[dataset]\\${PATH}: Obj2Tiles timed out after 600 s`;
        expect(skippedOutputOf([line], PATH)).toEqual({ output: '3D Tiles', reason: 'Obj2Tiles timed out after 600 s' });
    });

    it('has no reason for an unknown error', () => {
        expect(skippedOutputOf([`[10:00:00] [ddb] 3D Tiles generation skipped for ${PATH} (unknown error)`], PATH))
            .toEqual({ output: '3D Tiles', reason: '' });
    });

    it('is null for a build that skipped nothing, another file, or no log', () => {
        expect(skippedOutputOf(LOG.filter(line => !line.includes('skipped')), PATH)).toBeNull();
        expect(skippedOutputOf(LOG, 'other.obj')).toBeNull();
        // A file whose path starts with the path asked for is another file
        expect(skippedOutputOf(LOG, PATH.replace(/\.obj$/, ''))).toBeNull();
        expect(skippedOutputOf(undefined, PATH)).toBeNull();
        expect(skippedOutputOf(LOG, '')).toBeNull();
    });
});
