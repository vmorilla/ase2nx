import fs from "fs";
import { Cel, Layer, Point, Sprite } from "./sprite";
import { celNumberOfPatterns, celSpriteAttrsAndPatterns, tilemapAnchor } from "./cel";

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

