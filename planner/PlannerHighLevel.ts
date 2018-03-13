import {DNFFormula} from "../core/Types";
import {WorldState} from "../world/World";
import {DnfGoal, NodeGoal} from "./Goals";
import {IGraph, Successor} from "./Graph";
import {NodeLowLevel} from "./PlannerLowLevel";

/**
 * A high level graph of large goals which are represented by goal nodes. this
 * graph contains high level nodes which represent the current world state and
 * goal that needs to be fulfilled.
 * @param dnf The DNF that graph is supposed to fulfill.
 */
export class GraphHighLevel implements IGraph<NodeHighLevel> {
    public goalTreeRoot: DnfGoal;

    public constructor(dnf: DNFFormula) {
        this.goalTreeRoot = new DnfGoal(dnf);
    }

    public getStartingNode(world: WorldState): NodeHighLevel {
        return new NodeHighLevel(this.goalTreeRoot, NodeLowLevel.fromWorld(world));
    }

    public successors(current: NodeHighLevel): Array<Successor<NodeHighLevel>> {
        return current.successors();
    }

    public compareNodes(a: NodeHighLevel, b: NodeHighLevel): number {
        return a.compareTo(b);
    }
}

/**
 * Wraps the goal and worldstate. Uses incrementing ids as keys.
 * @param goalNode     The goal that needs to be fulfilled.
 * @param nodeLowLevel Represents the world state and is used for all low
 *                     level searches.
 */
export class NodeHighLevel {
    private static counter = 0;
    private id: number;

    public constructor(public goalNode: NodeGoal, public nodeLowLevel: NodeLowLevel) {
        this.id = NodeHighLevel.counter++;
    }

    public compareTo(other: NodeHighLevel): number {
        return this.getId().localeCompare(other.getId());
    }

    /**
     * Gets successors of a goal by evaluating it with the current world state.
     * @return Returns the succesors.
     */
    public successors(): Array<Successor<NodeHighLevel>> {
        const result: Array<Successor<NodeHighLevel>> = [];
        const goals = this.goalNode.getChildren(this.nodeLowLevel, false);
        for (const goal of goals) {
            const search = goal.evaluate(this.nodeLowLevel);
            if (search.success) {
                result.push({
                    action: search.path,
                    child: new NodeHighLevel(goal, search.state || this.nodeLowLevel),
                    cost: search.cost});
            } else {
                console.log("Failed to execute high level move");
                console.log(goal);
            }
        }
        return result;
    }

    public getId(): string {
        return this.id.toString();
    }

    public toString(): string {
        return this.getId();
    }

    public toSuccessor(): Successor<NodeHighLevel> {
        return {child: this, cost: 0, action: ""};
    }
}
