import {Graph, Successor} from "./Graph";
import {DnfGoal, NodeGoal} from "./Goals";
import {NodeLowLevel} from "./PlannerLowLevel";
import {DNFFormula} from "../core/Types";
import {WorldState} from "../world/World";

export class GraphHighLevel implements Graph<NodeHighLevel> {
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

export class NodeHighLevel {
    private static counter = 0;
    private id: number;

    public constructor(public goalNode: NodeGoal, public nodeLowLevel: NodeLowLevel) {
        this.id = NodeHighLevel.counter++;
    }

    public compareTo(other: NodeHighLevel): number {
        return this.getId().localeCompare(other.getId());
    }

    public successors(): Array<Successor<NodeHighLevel>> {
        const result: Array<Successor<NodeHighLevel>> = [];
        const goals = this.goalNode.getChildren(this.nodeLowLevel, false);
        for (const goal of goals) {
            const search = goal.evaluate(this.nodeLowLevel);
            if (search.success) {
                result.push({
                    child: new NodeHighLevel(goal, search.state || this.nodeLowLevel),
                    action: search.path,
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
        return {child: this, cost: 0, action: "asdf"};
    }
}
