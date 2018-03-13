import {ExampleWorlds} from "../world/ExampleWorlds";
import {TextWorld} from "../world/TextWorld";
import {parseUtteranceIntoPlan, splitStringIntoPlan} from "./Shrdlite";

/*
 * shrdlite-offline
 *
 * This is the main file for the command-line version.
 * You don't have to edit this file.
 */

// Extract command line arguments.

const nodename = process.argv[0];
const jsfile = process.argv[1].replace(/^.*\//, "");
const worldname = process.argv[2];
const utterances = process.argv.slice(3);

// Print command usage and exit if necessary.
const usage = "Usage: " + nodename + " " + jsfile +
    " (" + Object.keys(ExampleWorlds).join(" | ") + ")" +
    " (utterance | example no. | plan)*";
if (utterances.length === 0 || !ExampleWorlds[worldname]) {
    console.error(usage);
    process.exit(1);
}

// Loop through all example utterances, updating the world state
const world = new TextWorld(ExampleWorlds[worldname]);
world.printWorld();
for (let utter of utterances) {
    const example: number = parseInt(utter, 10);
    if (!isNaN(example)) {
        utter = world.currentState.examples[example];
        if (!utter) {
            console.error("ERROR: Cannot find example no. " + example);
            process.exit(1);
        }
    }
    console.log();
    console.log("############################################################" +
                "############################################################");
    console.log("#####", utter);
    console.log("############################################################" +
                "############################################################");
    console.log();
    let theplan: string[] | null | string = splitStringIntoPlan(utter);
    if (!theplan) {
        theplan = parseUtteranceIntoPlan(world, utter);
    }
    if (!theplan) {
        console.error("ERROR: Couldn't find a plan for utterance '" + utter + "'");
        process.exit(1);
    } else {
        console.log();
        world.performPlan(theplan as string[]);
        world.printWorld();
    }
}
