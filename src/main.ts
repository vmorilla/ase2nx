import { Command } from "commander";
import { loadSprite, Point, Tileset } from "./sprite";
import { writeTileDefinitions } from "./tiledefs_writer";
import { writeFrameDefinitions } from "./framedef_file";
import { writeLayer2 } from "./layer2_writer";
import packageJson from "../package.json";

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

const commandTileDefs = new Command("tiledefs")
    .description("Export tile definitions from Aseprite file.")
    .option("-o --output <output>", "Name of output binary file.")
    .argument('<input>', 'Input Aseprite file')
    .action(cmdTileDefs);

program
    .name(packageJson.name)
    .version(packageJson.version)
    .addCommand(commandLayer2)
    .addCommand(commandFrames)
    .addCommand(commandSprite)
    .addCommand(commandTileDefs)
    // .option('-s, --sources-dir <dir>', 'Output directory for source files (.c, .asm and .h)')
    // .option('-a, --assets-dir <dir>', 'Output directory for asset files')
    // .option('-b, --bank <number>', 'Starting 8k bank number for sprite assets')
    // .option('-t, --write-tile-definitions <file>', 'Write tile definitions to binary file')
    // .option('-c, --write-palettes <file>', 'Write palettes to binary file')
    // .option('-l, --layer2-prefix <prefix>', 'Write layer2 files using the provided prefix')
    // .option('-m, --balloon-map <file>', 'Write balloon map to binary file')
    .parse(process.argv);

