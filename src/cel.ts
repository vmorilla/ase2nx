import { ColorFn, nextColor256 } from "./colors";
import { celOffset } from "./framedef_file";
import { AnyTile, Cel, IndexColor, Point, RGBAColor, Tile, TileRef } from "./sprite";

export function celNumberOfPatterns(cel: Cel): number {
    const patternIndexes = new Set(cel.tilemap.map(tileRef => tileRef.tile.tileIndex));
    return patternIndexes.size;
}

/**
 * Relative pixel coordinates are limited to a range of -128 to 127. If the sprite is too large, we must use an anchor that is closer to the center
 * to avoid an overflow in the relative coordinates.
 *  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
 *                          A               
 * -8 -7 -6 -5 -4 -3 -2 -1 -0 +1 +2 +3 +4 +5 +6 +7
 *  
 * @param cel 
 * @returns 
 */
export function tilemapAnchor(cel: Cel): TileRef {

    if (cel.width > 16 || cel.height > 16)
        throw new Error("The tilemap is too large to be converted to a unified sprite");

    const minX = Math.max(0, cel.width - 8);
    const minY = Math.max(0, cel.height - 8);

    const tilemap = cel.tilemap;
    const anchor = tilemap.find(tile => tile.x >= minX && tile.y >= minY);

    if (!anchor)
        throw new Error("All tiles are empty: no anchor can be used");

    return anchor;
}

// Empty sprite... only bit is in attr 3 to indiciate the 5th byte is used
const emptySprite = Buffer.alloc(5);
emptySprite.fill(0).writeUInt8(0x40, 3);

function spriteNextAttrs(tileRef: TileRef): Buffer {
    const buffer = Buffer.alloc(5);
    const isAnchor = tileRef.x === 0 && tileRef.y === 0;

    if (isAnchor) {
        // Anchor tile
        buffer.writeUInt8(tileRef.x * 16, 0);
        buffer.writeUInt8(tileRef.y * 16, 1);
    }
    else {
        buffer.writeInt8(tileRef.x * 16, 0);
        buffer.writeInt8(tileRef.y * 16, 1);
    }


    // Attr 2
    const paletteIndex = 0; // For the moment, we asume that we use a common palette
    const attr2bit0 = isAnchor ? (tileRef.x & 0x100) >> 8 : 1;  // X MSB or relative palette
    const attr2bit1to4 = (tileRef.rotation ? 0x02 : 0x00) | (tileRef.yFlip ? 0x04 : 0x00) | (tileRef.xFlip ? 0x08 : 0x00);
    const attr2 = ((paletteIndex) << 4) | attr2bit1to4 | attr2bit0;
    buffer.writeUInt8(attr2, 2);

    // Attr 3
    const patternId = tileRef.tile.tileIndex;
    const attr3 = (patternId & 0x3f) | 0xc0; // Sprite is visible and attribute 4 is used
    buffer.writeUInt8(attr3, 3);

    // Attr 4
    const attr4bit0 = isAnchor ? (tileRef.y & 0x100) >> 8 : 1; // Y MSB or relative pattern
    // Bits 1 to 4 are set to 0 (no scale)
    const attr4bit5 = isAnchor ? 0x20 : 0x00; // Big sprite
    const attr4bit6 = isAnchor ? 0x00 : 0x40; // No collision detection
    buffer.writeUInt8(attr4bit0 | attr4bit5 | attr4bit6, 4);

    return buffer;
}

/**
 * Returns the buffer of attributes and the buffer of sprite patterns (not duplicated) used by the cel. The pattern 
 * and tile attribute that corresponds to the anchor is always the first one.
 * This way, pattern indexes can be relative to the anchor tile.
 * 
 * @param cel 
 * @param colorFn 
 * @returns 
 */
export function celSpriteAttrsAndPatterns(cel: Cel, refPoint: Point, colorFn = nextColor256()): Buffer {

    const tileSize = 16 * 16;
    const anchor = tilemapAnchor(cel);

    const tiles = cel.tilemap.map(tileref => tileref.tile) as Tile<RGBAColor>[];

    // Discard tiles referenced multiple times. First one is the anchor
    const noDupTiles = tiles.reduce((acc, tile) => acc.find(t => t.tileIndex === tile.tileIndex) ? acc : [...acc, tile], [anchor.tile as Tile<RGBAColor>]);

    const frameDescriptionSize = 4 + tiles.length * 5 + noDupTiles.length * tileSize;
    const buffer = Buffer.alloc(frameDescriptionSize);

    buffer.writeUInt8(tiles.length, 0); // Number of tiles (number of individual sprites)
    buffer.writeUInt8(noDupTiles.length, 1); // Number of patterns

    const [offsetX, offsetY] = celOffset(cel, refPoint);
    buffer.writeInt8(offsetX, 2); // Offset X
    buffer.writeInt8(offsetY, 3); // Offset Y

    const spriteAttrsStart = 4;
    const patternsStart = 4 + cel.tilemap.length * 5;

    for (const [index, tile] of noDupTiles.entries()) {
        for (let i = 0; i < tileSize; i++)
            buffer.writeUInt8(colorFn(tile.content[i]), index * tileSize + i + patternsStart);
    }

    const tileRemapping = new Map(noDupTiles.map((tile, index) => [tile.tileIndex, index]));
    const reorderedTilemap = [anchor, ...cel.tilemap.filter(tr => tr !== anchor)];
    const remappedTilemap: Array<TileRef> = reorderedTilemap.map(tileref => ({
        ...tileref,
        x: tileref.x - anchor.x,
        y: tileref.y - anchor.y,
        tile: { ...tileref.tile, tileIndex: tileRemapping.get(tileref.tile.tileIndex)! }
    }));


    for (const [index, tileRef] of remappedTilemap.entries()) {
        const attrsBuffer = spriteNextAttrs(tileRef);
        for (let i = 0; i < 5; i++)
            buffer.writeUInt8(attrsBuffer.readUInt8(i), spriteAttrsStart + index * 5 + i);
    }

    return buffer;

}


export function celGetPixel(cel: Cel, x: number, y: number, colorFn: ColorFn): number {
    if (x >= cel.canvasWidth || y >= cel.canvasHeight || x < 0 || y < 0) {
        throw new Error(`Pixel coordinates (${x}, ${y}) are out of bounds for cel of size ${cel.canvasWidth}x${cel.canvasHeight}`);
    }

    const tileWidth = cel.canvasWidth / cel.width;
    const tileHeight = cel.canvasHeight / cel.height;

    const xTile = Math.floor(x / tileWidth);
    const yTile = Math.floor(y / tileHeight);

    const tileRef = cel.tilemap.find(t => t.x === xTile && t.y === yTile);
    if (!tileRef) {
        return 0;
    } else {
        const tile = tileRef.tile as AnyTile;
        const pixel = tile.content[(x % tileWidth) + (y % tileHeight) * tileWidth];
        console.log(`Pixel at (${x}, ${y}) in tile (${xTile}, ${yTile}) is of type ${typeof pixel}`);
        if (typeof pixel === 'number') {
            return pixel;
        }
        else {
            return colorFn(pixel);
        }
    }
}

