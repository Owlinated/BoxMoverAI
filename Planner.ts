
import {AssertionError} from "assert";
import {aStarSearch} from "./AStarSearch";
import {Graph, SearchResult, Successor} from "./Graph";
import {Conjunction, DNFFormula, Literal, ShrdliteResult} from "./Types";
import {WorldState} from "./World";

/*
 * Planner
 *
 * The goal of the Planner module is to take the interpetation(s)
 * produced by the Interpreter module and to plan a sequence of
 * actions for the robot to put the world into a state compatible
 * with the user's command, i.e. to achieve what the user wanted.
 *
 * You should implement the function 'makePlan'.
 * The planner should use your A* search implementation to find a plan.
 */

//////////////////////////////////////////////////////////////////////
// exported functions, classes and interfaces/types

/**
 * Top-level driver for the Planner.
 * It calls `makePlan` for each given interpretation generated by the Interpreter.
 * You don't have to change this function.
 *
 * @param interpretations: List of possible interpretations.
 * @param world: The current state of the world.
 * @returns: List of planner results, which are the interpretation results augmented with plans.
 *           Each plan is represented by a list of strings.
 *           If there's a planning error, it throws an error with a string description.
 */
export function plan(interpretations: ShrdliteResult[], world: WorldState): ShrdliteResult[] {
    const errors: string[] = [];
    const plans: ShrdliteResult[] = [];
    const planner: Planner = new Planner(world);
    for (const result of interpretations) {
        try {
            result.plan = planner.makePlan(result.interpretation);
        } catch (err) {
            errors.push(err);
            continue;
        }
        if (result.plan.length === 0) {
            result.plan.push("The interpretation is already true!");
        }
        plans.push(result);
    }
    if (plans.length === 0) {
        // merge all errors into one
        throw errors.join(" ; ");
    }
    return plans;
}

class Planner {
    constructor(
        private world: WorldState,
    ) {}

    /**
     * The core planner method.
     * Note that you should not change the API (type) of this method, only its body.
     * This method should call the A* search implementation with
     * your implementation of the ShrdliteGraph.
     *
     * @param interpretation: The logical interpretation of the user's desired goal.
     * @returns: A plan, represented by a list of strings.
     *           If there's a planning error, it throws an error with a string description.
     */
    public makePlan(interpretation: DNFFormula): string[] {
        const state = this.world;
        const startNode = new ShrdliteNode(this.world.stacks, this.world.holding, this.world.arm, undefined);
        const goalTest = (node: ShrdliteNode) => this.checkGoal(node, interpretation);
        const path = aStarSearch(new ShrdliteGraph(), startNode, goalTest, this.getHeuristic, 60);
        const result =  path.path.map((node) => node.action);
        return result;
    }

    private checkGoal(node: ShrdliteNode, interpretation: DNFFormula) {
        for (const conjunciton of interpretation.conjuncts) {
            if (this.checkConjunction(node, conjunciton)) {
                return true;
            }
        }
        return false;
    }

    private checkConjunction(node: ShrdliteNode, conjunction: Conjunction) {
        for (const literal of conjunction.literals) {
            if (literal.relation === "holding") {
                if (literal.args.length !== 1) {
                    throw new Error("Literal needs exactly one argument");
                }
                if (literal.args[0] !== node.holding) {
                    return false;
                }
                continue;
            }

            if (literal.args.length !== 2) {
                throw new Error("Literal needs exactly two arguments");
            }
            const ObjectOne = this.getStackId(literal.args[0]);
            const ObjectTwo = this.getStackId(literal.args[1]);
            if(ObjectOne === undefined || ObjectTwo === undefined) {
                return false;
            }
            switch (literal.relation) {
                case "leftof":
                    if(ObjectOne >= ObjectTwo ){
                      return false;
                    }
                case "rightof":
                    if(ObjectOne <= ObjectTwo) {
                      return false;
                    }
                case "inside":
                /* falls through */
                case "ontop":
                    if(ObjectOne !== ObjectTwo) {
                      return false;
                    }
                    if(node.stacks[ObjectOne].indexOf(literal.args[0]) !== node.stacks[ObjectTwo].indexOf(literal.args[1]) + 1) {
                      return false;
                    }
                case "under":
                    if(ObjectOne !== ObjectTwo) {
                      return false;
                    }
                    if(node.stacks[ObjectOne].indexOf(literal.args[0]) > node.stacks[ObjectTwo].indexOf(literal.args[1])) {
                      return false;
                    }
                case "beside":
                    if(ObjectOne === ObjectTwo) {
                      return false;
                    }
                case "above":
                    if(ObjectOne !== ObjectTwo) {
                      return false;
                    }
                    if(node.stacks[ObjectOne].indexOf(literal.args[0]) < node.stacks[ObjectTwo].indexOf(literal.args[1])) {
                      return false;
                    }
                default:
                    throw new Error(`Unknown relation: ${literal.relation}`);
            }
        }
        return true;
    }

    private getStackId(objectName: string) {
        const stacks = this.world.stacks
            .filter((stack) => stack.some((obj) =>  obj === objectName));

        if (stacks.length === 0) {
            return undefined;
        }
        return this.world.stacks.indexOf(stacks[0]);
    }

    private getHeuristic(node: ShrdliteNode) {
        return 0;
    }
}

/*
 * A* search nodes, to be implemented and cleaned
 */
class ShrdliteNode {
    // These are for making the nodes possible to compare efficiently:
    public id: string;

    // Changing properties of the world:
    // Where the objects are located in the world.
    public stacks: string[][];
    // Which object the robot is currently holding, or null if not holding anything.
    public holding: string | null;
    // The column position of the robot arm.
    public  arm: number;

    constructor(stacks: string[][], holding: string | null, arm: number, action: Action | undefined) {
        // Copy properties
        this.stacks = [];
        for (const stack of stacks) {
            this.stacks.push(stack.slice());
        }
        this.holding = holding;
        this.arm = arm;

        // Update properties with action
        if (action !== undefined) {
            this.updateState(action);
        }
    }

    public toString(): string {
        return this.id;
    }

    public compareTo(other: ShrdliteNode) {
        return this.id.localeCompare(other.id);
    }

    private updateState(action: Action) {
        switch (action) {
            case "l":
                if (this.arm === 0) {
                    throw new Error("Cannot move left from leftmost position");
                }
                this.arm--;
            case "r":
                if (this.arm === this.stacks.length - 1) {
                    throw new Error("Cannot move right from rightmost position");
                }
                this.arm++;
            case "p":
                if (this.holding !== null) {
                    throw new Error("Cannot pick up an item when already holding something");
                }
                const stack = this.stacks[this.arm];
                if (stack.length === 0) {
                    throw new Error("Cannot pick up from empty stack");
                }
                const pickedUp = stack.splice(-1, 1);
                this.holding = pickedUp[0];
            case "d":
                if (this.holding === null) {
                    throw new Error("Cannot drop an item without holding something");
                }
                // TODO rule validation
                this.stacks[this.arm].push(this.holding);
                this.holding = null;
        }

        this.id = "";
        for (const stack of this.stacks) {
            this.id += stack.join() + "|";
        }
        this.id += this.arm + "|" + this.holding;
    }
}

/*
 * A* search graph, to be implemented and cleaned
 */
class ShrdliteGraph implements Graph<ShrdliteNode> {
    public successors(current: ShrdliteNode): Array<Successor<ShrdliteNode>> {
        const result = [];
        const actions = ["l", "r", "p", "d"];
        for (const action of actions) {
            // todo rewrite without exeptions!
            try {
                const node = new ShrdliteNode(current.stacks, current.holding, current.arm, action);
                // todo change cost
                const successor: Successor<ShrdliteNode> = {child: node, action, cost: 1}
                result.push(successor);
            } catch {
                // Ignore
            }
        }
        return result;
    }

    public compareNodes(a: ShrdliteNode, b: ShrdliteNode): number {
        return a.compareTo(b);
    }
}

type Action = "l" | "r" | "p" | "d" | string;
