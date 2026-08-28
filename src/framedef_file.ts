import fs from "fs";
import { AnyTile, Cel, Layer, Point, RGBAColor, Sprite, Tile } from "./sprite";
import { celNumberOfPatterns, celSpriteAttrsAndPatterns, celSpriteAttrsPooled, tilemapAnchor } from "./cel";
import { nextColor256 } from "./colors";

/**
 * Produces a set of asm files with the frame definition of all the sprites, together with binary files for its content
 * Asm files are grouped by memory page (8k) starting in the @page parameter.
 * The content includes both the attributes and the patterns
 * Asm files follow the name convention: @asmDir/sprites_page_nn.asm
 * Binary files follow the name convention: @binaryDir/sprites_skin_nn.bin where nn is the frame number
 */
export function writeFrameDefinitions(sprite: Sprite, outputFile: string, refPoint: Point) {
    const layer = sprite.layers[0];

    const maxNPatterns = layer.cels.reduce((max, cel) => Math.max(max, celNumberOfPatterns(cel)), 0);
    const maxNSprites = layer.cels.reduce((max, cel) => Math.max(max, cel.tilemap.length), 0);

    const bufferStart = Buffer.alloc(3);

    bufferStart.writeUInt8(maxNSprites, 0); // Max number of sprites
    bufferStart.writeUInt8(maxNPatterns, 1); // Max number of patterns
    bufferStart.writeUInt8(layer.cels.length, 2); // Number of frames

    const buffer = layer.cels.reduce((acc, cel) => Buffer.concat([acc, celSpriteAttrsAndPatterns(cel, refPoint)]), bufferStart);
    fs.writeFileSync(outputFile, buffer);

    console.log(`Definition length: ${3 + 3 * layer.cels.length}`);
}

// A pool frame must fit in one 8 KB page of the loader together with its padded
// attribute area, so it can hold at most 16 patterns (4 + 5 * nSprites + 16 * 256 < 8192)
const MAX_POOL_FRAME_PATTERNS = 16;

/**
 * Pooled variant of writeFrameDefinitions for skins whose patterns stay permanently
 * resident in the sprite pattern memory (e.g. the net, see src/game/net.c in next-point).
 *
 * The patterns of all the cels are de-duplicated into a single pool. The output contains:
 *   - header: maxNSprites, pool size (so the loader reserves the whole pool), total frames
 *   - one attribute-only frame per cel (nPatterns = 0, absolute pattern indexes in the pool)
 *   - the pool appended as pattern-only frames (nTiles = 0, up to 16 patterns each)
 */
export function writePooledFrameDefinitions(sprite: Sprite, outputFile: string, refPoint: Point) {
    const layer = sprite.layers[0];
    const cels = layer.cels;

    const maxNSprites = cels.reduce((max, cel) => Math.max(max, cel.tilemap.length), 0);

    // Shared pattern pool: every distinct tile used by any cel, in order of first appearance
    const poolIndex = new Map<AnyTile, number>();
    const pool: Tile<RGBAColor>[] = [];
    for (const cel of cels)
        for (const tileRef of cel.tilemap)
            if (!poolIndex.has(tileRef.tile)) {
                poolIndex.set(tileRef.tile, pool.length);
                pool.push(tileRef.tile as Tile<RGBAColor>);
            }

    if (pool.length > 64)
        throw new Error(`Pattern pool of ${pool.length} patterns exceeds the 64 hardware slots`);

    const displayFrames = cels.map(cel => celSpriteAttrsPooled(cel, refPoint, poolIndex));

    const colorFn = nextColor256();
    const tileSize = 16 * 16;
    const poolFrames: Buffer[] = [];
    for (let start = 0; start < pool.length; start += MAX_POOL_FRAME_PATTERNS) {
        const chunk = pool.slice(start, start + MAX_POOL_FRAME_PATTERNS);
        const buffer = Buffer.alloc(4 + chunk.length * tileSize);
        buffer.writeUInt8(0, 0); // No tiles: pattern-only frame
        buffer.writeUInt8(chunk.length, 1);
        // Offsets (bytes 2 and 3) are meaningless for a pattern-only frame: left at 0
        chunk.forEach((tile, t) => {
            for (let i = 0; i < tileSize; i++)
                buffer.writeUInt8(colorFn(tile.content[i]), 4 + t * tileSize + i);
        });
        poolFrames.push(buffer);
    }

    const header = Buffer.alloc(3);
    header.writeUInt8(maxNSprites, 0); // Max number of sprites
    header.writeUInt8(pool.length, 1); // Max number of patterns: the whole pool is reserved
    header.writeUInt8(cels.length + poolFrames.length, 2); // Display frames + pool frames

    fs.writeFileSync(outputFile, Buffer.concat([header, ...displayFrames, ...poolFrames]));

    console.log(`Pooled sprite: ${cels.length} display frames, ${pool.length} patterns in ${poolFrames.length} pool frames`);
}

interface FrameDefData {
    offsetX: number;
    offsetY: number;
    nTiles: number;
    nPatterns: number;
    identifier: string;
    binary_filename: string;
    binary_size: number;
    skin: Layer;
    frameNumber: number;
}

function patternOffsetBySkin(frames: FrameDefData[]): Map<string, number> {
    const groupsBySkin = groupBy(frames, f => f.skin.name);
    const map = new Map<string, number>();

    let offset = 0;
    for (const [skin, skinFrames] of groupsBySkin) {
        const maxNPatterns = Math.max(...skinFrames.map(f => f.nPatterns));
        map.set(skin, offset);
        offset += maxNPatterns;
    }

    return map;
}


export function celOffset(cel: Cel, refPoint: Point): [number, number] {
    const absRefPoint = [refPoint[0] * cel.canvasWidth, refPoint[1] * cel.canvasHeight];
    const anchor = tilemapAnchor(cel);
    const anchorPosition = [anchor.x * 16 + cel.xPos, anchor.y * 16 + cel.yPos];
    return [anchorPosition[0] - absRefPoint[0], anchorPosition[1] - absRefPoint[1]];
}


// ================================================================================ //
// General utils                                                                   //
// ================================================================================ //

function groupBy<T, K>(array: T[], key: (item: T) => K): Map<K, T[]> {
    return array.reduce((acc, item) => {
        const k = key(item);
        if (!acc.has(k)) {
            acc.set(k, []);
        }
        acc.get(k)!.push(item);
        return acc;
    }, new Map<K, T[]>());
}

