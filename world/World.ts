
import {SimpleObject} from "../core/Types";

/*
 * World
 * Interface definitions for worlds.
 *
 * You don't have to edit this file (unless you do some radical changes to the world).
 */

/*
 * The state of the world.
 * The 'stacks' is a list of stacks, where each stack is a list of strings.
 * The strings themselves are identifiers, i.e. keys into the `objects` map.
 */
export interface WorldState {
    stacks: string[][];    // Where the objects are located in the world.
    holding: string | null; // Which object the robot is currently holding, or null if not holding anything.
    arm: number;        // The column position of the robot arm.
    examples: string[];     // List of predefined example utterances that the user can choose from in the UI.
    objects: {[s: string]: SimpleObject}; // A mapping from object id's to object definitions
}

/*
 * Interface for a world. Abstracts over the I/O required to read user input,
 * print the world and perform a plan. This is needed to support the backends,
 * i.e. the SVG backend that is used in the browser, and the text-based console backend.
 */
export interface World {
    currentState: WorldState;

    printWorld(callback?: () => void): void;
    performPlan(plan: string[], callback?: () => void): void;

    readUserInput(prompt: string, callback: (input: string) => void): void;
    printSystemOutput(output: string, participant?: string): void;
    printDebugInfo(info: string): void;
    printError(error: string, message?: string): void;
}
