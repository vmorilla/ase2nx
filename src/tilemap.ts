import fs from "fs";
import { Cel } from "./sprite";

export function writeTileMaps(cels: Cel[], width: number, height: number, output: string) {
    if (output.includes("{frame}")) {
        cels.forEach((cel, index) => {
            const tilemapBuffer = writeTileMap(cel, width, height);
            const frameOutput = output.replace("{frame}", index.toString());
            fs.writeFileSync(frameOutput, tilemapBuffer);
        });
    } else {
        // Single file with all tilemaps concatenated
        const buffers: Buffer[] = [];
        cels.forEach((cel) => {
            const tilemapBuffer = writeTileMap(cel, width, height);
            buffers.push(tilemapBuffer);
        });
        const finalBuffer = Buffer.concat(buffers);
        fs.writeFileSync(output, finalBuffer);
    }

}

function writeTileMap(cel: Cel, outputWidth: number, outputHeight: number): Buffer {
    const mapWidth = cel.canvasWidth / 8;
    const mapHeight = cel.canvasHeight / 8;

    const tilemapBuffer = Buffer.alloc(outputWidth * outputHeight);

    for (let y = 0; y < outputHeight; y++) {
        for (let x = 0; x < outputWidth; x++) {
            const tileX = center(x, outputWidth, mapWidth);
            const tileY = center(y, outputHeight, mapHeight);
            if (tileX === -1 || tileY === -1) {
                tilemapBuffer[x + y * outputWidth] = 0; // Empty tile
            } else {
                tilemapBuffer[x + y * outputWidth] = cel.tilemap[tileX + tileY * mapWidth].tile.tileIndex;
            }
        }
    }

    return tilemapBuffer;
}

function center(position: number, outputSize: number, contentSize: number): number {
    const margin = Math.round((outputSize - contentSize) / 2);
    if (position < margin) return -1;
    if (position >= outputSize - margin) return -1;
    return position - margin;
}
