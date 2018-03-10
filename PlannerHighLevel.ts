import {Graph, Successor} from "./Graph";
import {GoalNode, InitialGoalNode} from "./PlannerGoals";
import {NodeLowLevel} from "./PlannerLowLevel";
import {DNFFormula} from "./Types";
import {WorldState} from "./World";

export class GraphHighLevel implements Graph<NodeHighLevel> {
    public goalTreeRoot: InitialGoalNode;

    public constructor(dnf: DNFFormula) {
        this.goalTreeRoot = new InitialGoalNode(dnf);
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
    public constructor(public goalNode: GoalNode, public nodeLowLevel: NodeLowLevel) {}

    public compareTo(other: NodeHighLevel): number {
        return this.getId().localeCompare(other.getId());
    }

    public successors(): Array<Successor<NodeHighLevel>> {
        const result: Array<Successor<NodeHighLevel>> = [];
        const goals = this.goalNode.getChildren(this.nodeLowLevel);
        for (const goal of goals) {
            const search = goal.evaluate(this.nodeLowLevel);
            if (search.success) {
                result.push({
                    child: new NodeHighLevel(goal, search.state || this.nodeLowLevel),
                    action: search.path,
                    cost: search.cost});
            } else {
                console.log("Failed to execute high level move");
            }
        }
        return result;
    }

    public getId(): string {
        return this.nodeLowLevel.id + this.goalNode.toString();
    }

    public toString(): string {
        return this.getId();
    }

    public toSuccessor(): Successor<NodeHighLevel> {
        return {child: this, cost: 0, action: "asdf"};
    }
}