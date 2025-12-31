import { celGetPixel } from "./cel";
import { nextColor256 } from "./colors";
import { Sprite } from "./sprite";
import fs from "fs";

function* rasterBitmap(width: number, height: number): Generator<[number, number]> {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            yield [x, y];
        }
    }
}

function* columnarRasterBitmap(width: number, height: number): Generator<[number, number]> {
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            yield [x, y];
        }
    }
}

export function writeBitmap(sprite: Sprite, outputFile: string, columnar: boolean) {
    const colorFn = nextColor256();
    const bitmapData: number[] = [];
    const raster = columnar ? columnarRasterBitmap : rasterBitmap;

    const cels = sprite.layers[0].cels; // Assume we are working with the flattered layer
    for (let cel of cels) {
        for (let [x, y] of raster(cel.canvasWidth, cel.canvasHeight)) {
            const pixel = celGetPixel(cel, x, y, colorFn);
            bitmapData.push(pixel);
        }
    }

    const buffer = Buffer.from(bitmapData);
    fs.writeFileSync(outputFile, buffer);
}

