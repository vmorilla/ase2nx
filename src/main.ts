import { Command } from "commander";
import { loadSprite, Point, Tileset } from "./sprite";
import { writeTileDefinitions } from "./tiledefs_writer";
import { writeFrameDefinitions } from "./framedef_file";
import { writeLayer2 } from "./layer2_writer";
import packageJson from "../package.json";
import { writeBitmap } from "./bitmap";
import { writeTileMaps } from "./tilemap";
import { writePalettes } from "./palettes_writer";

interface Options {
    sourcesDir?: string;
    assetsDir?: string;
    bank?: number;
    writeTileDefinitions?: string;
    writePalettes?: string;
    layer2Prefix?: string;
    balloonMap?: string;
}

export const ReferencePoint = {
    TopLeft: [0, 0] as Point,
    TopCenter: [0.5, 0] as Point,
    TopRight: [1, 0] as Point,
    BottomLeft: [0, 1] as Point,
    BottomRight: [1, 1] as Point,
    BottomCenter: [0.5, 1] as Point,
    Center: [0.5, 0.5] as Point
}

function cmdLayer2(inputFile: string, options: { output?: string, verbose: boolean }) {
    const output = options.output ?? inputFile.replace(/\.(ase|aseprite)$/, "{frame}.l2");
    const sprite = loadSprite(inputFile);

    for (let frame = 0; frame < sprite.frames.length; frame++) {
        const frameOutput = output.replace("{frame}", frame.toString());
        if (options.verbose) {
            console.log(`Writing frame ${frame} to ${frameOutput}`);
        }
        writeLayer2(sprite, frameOutput, frame);
    }
}

function cmdSprite(inputFile: string, options: { output?: string, verbose: boolean }) {
    const output = options.output ?? inputFile.replace(/\.(ase|aseprite)$/, ".sp");
    const sprite = loadSprite(inputFile);

    // Write sprite definitions mode
    writeFrameDefinitions(sprite, output, ReferencePoint.BottomCenter);
}

function cmdTileDefs(inputFile: string, options: { output: string }) {
    const sprite = loadSprite(inputFile);
    const layers = sprite.layers.filter(layer => layer.tileset) as { tileset: Tileset }[];
    const tilesets = layers.map(layer => layer.tileset);
    writeTileDefinitions(tilesets, options.output);
}

function cmdBitmap(inputFile: string, options: { output: string, columnar: boolean }) {
    const sprite = loadSprite(inputFile);

    writeBitmap(sprite, options.output, options.columnar);
}

function cmdTileMap(inputFile: string, options: { output: string, width?: number, height?: number }) {
    const sprite = loadSprite(inputFile);
    const layer = sprite.layers.find(l => l.tileset != null);
    if (!layer) {
        console.error("No layer with tileset found in the sprite.");
        return;
    }

    const tileset = layer.tileset!;
    if (tileset.width != 8 || tileset.height != 8) {
        console.error("Tilemap export only supports 8x8 tiles.");
        return;
    }

    const width = options.width ?? layer.cels[0].canvasWidth / tileset.width;
    const height = options.height ?? layer.cels[0].canvasHeight / tileset.height;

    writeTileMaps(layer.cels, width, height, options.output);
}

async function cmdPalette(inputFile: string, options: { output: string }) {
    const sprite = loadSprite(inputFile);
    await writePalettes([sprite], options.output);
}


// Output files in some commands are prepared to substitute {frame} with the frame number
// e.g., tilemap_{frame}.tm

// Initialize commander
const program = new Command();

const commandLayer2 = new Command("layer2")
    .description("Export frames in Aseprite file as layer2 binary files.")
    .option("-o --output <output>", "Name of output file/s. If it includes <frame>, it will be replaced with the frame number.")
    .option("-v --verbose", "Enable verbose output", false)
    .argument('<input>', 'Input Aseprite file')
    .action(cmdLayer2);

const commandFrames = new Command("frames")
    .description("Returns the number of frames in the Aseprite file.")
    .argument('<input>', 'Input Aseprite file')
    .action(async (input: string) => {
        const sprite = await loadSprite(input);
        console.log(sprite.frames.length);
    });

const commandSprite = new Command("sprite")
    .description("Export the file as sprite frames")
    .option("-o --output <output>", "Name of output file/s.")
    .option("-v --verbose", "Enable verbose output", false)
    .argument('<input>', 'Input Aseprite file')
    .action(cmdSprite);

const commandTileDefs = new Command("tiledef")
    .description("Export tile definitions from Aseprite file.")
    .option("-o --output <output>", "Name of output binary file.")
    .argument('<input>', 'Input Aseprite file')
    .action(cmdTileDefs);

const commandBitmap = new Command("bitmap")
    .description("Exports a bitmap for layer2 from Aseprite file.")
    .option("-o --output <output>", "Name of output bitmap file.")
    .option("-c --columnar", "Export bitmap in columnar format for layer 320x256 mode.", false)
    .argument('<input>', 'Input Aseprite file')
    .action(cmdBitmap);

const commandTileMap = new Command("tilemap")
    .description("Exports the tilemap / tilemaps")
    .option("-o --output <output>", "Name of output tilemap file.")
    .option("-w --width <width>", "Force the width of the tilemap")
    .option("-h --height <height>", "Force the height of the tilemap")
    .argument('<input>', 'Input Aseprite file')
    .action(cmdTileMap);

const commandPalette = new Command("palette")
    .description("Export palettes from Aseprite file.")
    .option("-o --output <output>", "Name of output palette file.")
    .argument('<input>', 'Input Aseprite file')
    .action(cmdPalette);

program
    .name(packageJson.name)
    .version(packageJson.version)
    .addCommand(commandLayer2)
    .addCommand(commandFrames)
    .addCommand(commandSprite)
    .addCommand(commandTileDefs)
    .addCommand(commandBitmap)
    .addCommand(commandTileMap)
    .addCommand(commandPalette)
    .parse(process.argv);

