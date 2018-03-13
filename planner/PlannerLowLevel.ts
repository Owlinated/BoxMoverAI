import {DNFFormula, SimpleObject} from "../core/Types";
import {WorldState} from "../world/World";
import {aStarSearch} from "./AStarSearch";
import {Graph, Successor} from "./Graph";

/**
 * A graph representing possible arm movements.
 */
export class GraphLowLevel implements Graph<NodeLowLevel> {
    // Gets succesors for each possible arm movement.
    public successors(current: NodeLowLevel): Array<Successor<NodeLowLevel>> {
        const result = [];
        const actions = ["l", "r", "p", "d"];
        for (const action of actions) {
            const node = current.clone();
            if (node.updateState(action)) {
                const successor: Successor<NodeLowLevel> = {child: node, action, cost: 1};
                result.push(successor);
            }
        }
        return result;
    }

    public compareNodes(a: NodeLowLevel, b: NodeLowLevel): number {
        return a.compareTo(b);
    }
}

/**
 * Wraps the current world state. Can simulate arm movements.
 * @param stacks  The stacks of the world.
 * @param holding The item that the arm is holding.
 * @param arm     The position of the arm.
 * @param world   The original world state.
 */
export class NodeLowLevel {
    // String identifier for efficient comparison
    public id: string = "";

    // Copy of the worlds stacks
    public stacks: string[][];

    constructor(stacks: string[][], public holding: string | null, public  arm: number, public world: WorldState) {
        // Make copy of stacks
        this.stacks = [];
        for (const stack of stacks) {
            this.stacks.push(stack.slice());
        }
    }

    public clone(): NodeLowLevel {
        return new NodeLowLevel(this.stacks, this.holding, this.arm, this.world);
    }

    public static fromWorld(world: WorldState): NodeLowLevel {
        return new NodeLowLevel(world.stacks, world.holding, world.arm, world);
    }

    public toString(): string {
        return this.id;
    }

    public compareTo(other: NodeLowLevel) {
        return this.id.localeCompare(other.id);
    }

    /**
     * Simulates arm movements.
     * @param  action The action that the arm should take.
     * @return        True if move has been executed, false otherwise.
     */
    public updateState(action: Action): boolean {
        switch (action) {
            // Move arm left
            case "l":
                if (this.arm === 0) {
                    // Cannot move left from leftmost position
                    return false;
                }
                this.arm--;
                break;
            // Move arm right
            case "r":
                if (this.arm === this.stacks.length - 1) {
                    // Cannot move right from rightmost position
                    return false;
                }
                this.arm++;
                break;
            // Pick up object
            case "p":
                if (this.holding !== null) {
                    // Cannot pick up an item when already holding something
                    return false;
                }
                const pickStack = this.stacks[this.arm];
                if (pickStack.length === 0) {
                    // Cannot pick up from empty stack
                    return false;
                }
                const pickedUp = pickStack.splice(-1, 1);
                this.holding = pickedUp[0];
                break;
            // Drop object
            case "d":
                if (this.holding === null) {
                    // Cannot drop an item without holding something
                    return false;
                }

                // Can drop anything on the floor
                const dropStack = this.stacks[this.arm];
                if (dropStack.length !== 0) {
                    const objectA = this.world.objects[this.holding];
                    const objectB = this.world.objects[dropStack[dropStack.length - 1]];
                    if (!canPlace(objectA, objectB)) {
                        return false;
                    }
                }
                this.stacks[this.arm].push(this.holding);
                this.holding = null;
                break;
        }

        this.id = "";
        for (const stack of this.stacks) {
            this.id += stack.join() + "|";
        }
        this.id += this.arm + "|" + this.holding;
        return true;
    }
}

/**
 * Checks if we can place an item ontop of another item
 * @param  objectA The item we want to place.
 * @param  objectB The item we want to place items on.
 * @return         Returns true if possible, false otherwise.
 */
export function canPlace(objectA: SimpleObject, objectB: SimpleObject): boolean {
    if (objectA === undefined) {
        // We cannot move the floor
        return false;
    }
    if (objectB === undefined) {
        // Can place everything on floor
        return true;
    }
    if (objectB.form === "ball") {
        // Cannot drop anything on a ball
        return false;
    }
    if (objectB.form === "box") {
        // Inside box
        if (objectA.size === "large" && objectB.size === "small") {
            return false;
        }
        if (objectA.form === "pyramid" || objectA.form === "plank" || objectA.form === "box") {
            if (objectB.size === "small" || objectA.size === "large") {
                return false;
            }
        }
    } else {
        // On object
        if (objectA.size === "large" && objectB.size === "small") {
            return false;
        }
        if (objectA.form === "ball") {
            return false;
        }
        if (objectA.form === "box" && objectA.size === "small") {
            if ((objectB.form === "brick" || objectB.form === "pyramid") && objectB.size === "small") {
                return false;
            }
        }
        if (objectA.form === "box" && objectA.size === "large") {
            if (objectB.form === "pyramid") {
                return false;
            }
        }
    }
    return true;
}

type Action = "l" | "r" | "p" | "d" | string;
