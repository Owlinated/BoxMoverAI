import {aStarSearch} from "./AStarSearch";
import {SearchResult} from "./Graph";
import {GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";
import {Conjunction, DNFFormula, Literal} from "./Types";

export abstract class GoalNode {
    public children: GoalNode[] = [];
    public abstract evaluate: (state: NodeLowLevel) =>
        {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined};
    public abstract isFulfilled: (state: NodeLowLevel) => boolean;
    // Get heuristic of all necessary paths down to end
    public abstract getHeuristicDown: (state: NodeLowLevel) => number;

    public constructor(public parentNode: GoalNode | undefined) {}

    public getChildren(state: NodeLowLevel): GoalNode[] {
        if (this.isFulfilled(state)) {
            return this.parentNode!.getChildren(state);
        }

        const result = this.children.filter((child) => !child.isFulfilled(state));
        if (result.length === 0) {
            return this.parentNode!.getChildren(state);
        }
        return result;
    }

    public evaluateLowLevel(state: NodeLowLevel)
        : {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined} {
        const search = aStarSearch(new GraphLowLevel(),
            state,
            (node) => this.isFulfilled(node),
            (node) => .5 * this.getHeuristic(node) + .5 * this.getHeuristicUp(node),
            10);
        const actions = search.path.map((action) => action.action);
        actions.unshift(this.explain(""));
        return {
            success: search.status === "success",
            cost: search.cost, path: actions.join(";"),
            state: search.path.length > 0 ? search.path[search.path.length - 1].child : undefined
        };
    }

    public evaluateSkip(state: NodeLowLevel)
        : {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined} {
        return {success: true, cost: 0, path: "", state: undefined};
    }

    public allFulfilled(state: NodeLowLevel): boolean {
        return this.children.every((child) => child.isFulfilled(state));
    }

    public someFulfilled(state: NodeLowLevel): boolean {
        return this.children.some((child) => child.isFulfilled(state));
    }

    // Get this nodes heuristic
    public abstract getHeuristic(state: NodeLowLevel): number;

    // Get heuristic of all necessary paths up to root
    public getHeuristicUp(state: NodeLowLevel): number {
        return this.parentNode!.getHeuristicUp(state);
    }

    public maxHeuristicDown(state: NodeLowLevel): number {
        return Math.max.apply(Math, this.children.map((child) => child.getHeuristicDown(state)));
    }

    public minHeuristicDown(state: NodeLowLevel): number {
        return Math.min.apply(Math, this.children.map((child) => child.getHeuristicDown(state)));
    }

    public abstract toString(): string;

    public abstract explain(previous: string): string;
}

export class FinalNode extends GoalNode {
    public evaluate = this.evaluateSkip;
    public isFulfilled = (state: NodeLowLevel) => true;
    public getHeuristicDown = (state: NodeLowLevel) => 0;

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public toString(): string {
        return "Goal";
    }

    public explain(previous: string): string {
        return previous;
    }
}

export class InitialGoalNode extends GoalNode {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.someFulfilled;
    public getHeuristicDown = this.minHeuristicDown;

    public constructor(dnf: DNFFormula) {
        super(undefined);
        this.children = dnf.conjuncts.map((conjunction) => new DNFNode(conjunction, this));
    }

    public getChildren(state: NodeLowLevel): GoalNode[] {
        if (this.isFulfilled(state)) {
            return [new FinalNode(this)];
        }
        return this.children.filter((child) => !child.isFulfilled(state));
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public getHeuristicUp(state: NodeLowLevel): number {
        return 0;
    }

    public toString(): string {
        return "Start";
    }

    public explain(previous: string): string {
        return `I ${previous}.`;
    }
}

class DNFNode extends GoalNode {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.allFulfilled;
    public getHeuristicDown = this.maxHeuristicDown;

    public constructor(public conjunction: Conjunction, parentNode: GoalNode) {
        super(parentNode);
        this.children = conjunction.literals.map((literal) => this.create(literal));
    }

    private create(literal: Literal): GoalNode {
        if (literal.relation === "holding") {
            return new PickUpNode(literal.args[0], this);
        }
        if (literal.args.length !== 2) {
            throw new Error("Unexpected number of arguments");
        }
        switch (literal.relation) {
            case "leftof":
                literal.args = literal.args.reverse();
            /* falls through */
            case "rightof":
            // todo create right of
            case "inside":
            /* falls through */
            case "ontop":
            // todo create ontop
            case "under":
                literal.args = literal.args.reverse();
            /* falls through */
            case "above":
            // todo create above
            case "beside":
            // todo create beside
            default:
                throw new Error(`Unknown relation: ${literal.relation}`);
        }
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public getHeuristicUp(state: NodeLowLevel): number {
        return this.getHeuristicDown(state);
    }

    public toString(): string {
        return "conjunction" + this.conjunction.toString();
    }

    public explain(previous: string): string {
        const appendix = ` fulfill ${this.conjunction.toString()}`;
        return this.parentNode!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class PickUpNode extends GoalNode {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => state.holding === this.item;
    public getHeuristicDown = this.getHeuristic;

    public constructor(public item: string, parent: GoalNode) {
        super(parent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        const contStack = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (contStack.length === 0) {
            return 0;
        }
        let result = Math.abs(state.arm - state.stacks.indexOf(contStack[0]));
        if (state.holding !== undefined) {
            result++;
        }
        return result;
    }

    public toString(): string {
        return "PickUp" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` pick up ${this.item}`;
        return this.parentNode!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}