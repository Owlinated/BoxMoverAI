import {aStarSearch} from "./AStarSearch";
import {GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";
import {Conjunction, DNFFormula, Literal, Relation} from "./Types";

export abstract class NodeGoal {
    public children: NodeGoal[] = [];
    public abstract evaluate: (state: NodeLowLevel) =>
        {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined};
    public abstract isFulfilled: (state: NodeLowLevel) => boolean;
    // Get heuristic of all necessary paths down to end
    public abstract getHeuristicDown: (state: NodeLowLevel) => number;

    public constructor(public parentNode: NodeGoal | undefined) {}

    public getChildren(state: NodeLowLevel): NodeGoal[] {
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
            1);
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

export abstract class CompositeGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.allFulfilled;
    public getHeuristicDown = this.maxHeuristicDown;

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }
}

export class FinalNode extends NodeGoal {
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

export class DnfGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.someFulfilled;
    public getHeuristicDown = this.minHeuristicDown;

    public constructor(dnf: DNFFormula) {
        super(undefined);
        this.children = dnf.conjuncts.map((conjunction) => new ConjunctionGoal(conjunction, this));
    }

    public getChildren(state: NodeLowLevel): NodeGoal[] {
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

class ConjunctionGoal extends CompositeGoal {
    public constructor(public conjunction: Conjunction, parentNode: NodeGoal) {
        super(parentNode);
        this.children = conjunction.literals.map((literal) => this.create(literal));
    }

    private create(literal: Literal): NodeGoal {
        if (literal.relation === "holding") {
            return new PickUpGoal(literal.args[0], this);
        }
        if (literal.args.length !== 2) {
            throw new Error("Unexpected number of arguments");
        }
        switch (literal.relation) {
            case "leftof":
                return new MoveBidirectional(literal.args[0], literal.args[1], "leftof", "rightof", this);
            case "rightof":
                return new MoveBidirectional(literal.args[0], literal.args[1], "rightof", "leftof", this);
            case "beside":
            // todo create beside
            case "inside":
            /* falls through */
            case "ontop":
            // todo create ontop
            case "under":
                literal.args = literal.args.reverse();
            /* falls through */
            case "above":
            // todo create above
            default:
                throw new Error(`Unknown relation: ${literal.relation}`);
        }
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

export class PickUpGoal extends CompositeGoal {
    public clearStackGoal: ClearStackGoal;
    public pickUpGoal: HoldingGoal;

    public constructor(public item: string, parent: NodeGoal) {
        super(parent);
        this.clearStackGoal = new ClearStackGoal(item, this);
        this.pickUpGoal = new HoldingGoal(item, this);
        this.isFulfilled = this.pickUpGoal.isFulfilled;
        this.children = [this.clearStackGoal, this.pickUpGoal];
    }

    public toString(): string {
        return "PickUp" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` pick up ${this.item}`;
        return this.parentNode!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class HoldingGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => state.holding === this.item;
    public getHeuristicDown = this.getHeuristic;

    public constructor(public item: string, parent: NodeGoal) {
        super(parent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return 0;
        }
        let result = Math.abs(state.arm - state.stacks.indexOf(stacks[0]));
        if (state.holding !== undefined) {
            result++;
        }
        return result;
    }

    public toString(): string {
        return "Holding" + this.item;
    }

    public explain(previous: string): string {
        return this.parentNode!.explain(previous);
    }
}

class ClearStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return true;
        }
        return stacks[0].indexOf(this.item) === stacks[0].length - 1;
    }
    public getHeuristicDown = this.getHeuristic;

    public constructor(public item: string, parent: NodeGoal) {
        super(parent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return 0;
        }
        let result = Math.abs(state.arm - state.stacks.indexOf(stacks[0]));
        if (state.holding !== undefined) {
            result++;
        }
        result += stacks[0].length - 1 - stacks[0].indexOf(this.item);
        return result;
    }

    public toString(): string {
        return "Clear" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` clear the stack above ${this.item}`;
        return this.parentNode!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

export class MoveBidirectional extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.someFulfilled;
    public getHeuristicDown = this.minHeuristicDown;

    public constructor(public item: string,
                       public goal: string,
                       public relationA: Relation,
                       public relationB: Relation,
                       parent: NodeGoal) {
        super(parent);
        this.children = [
            new MoveToStackGoal(item, goal, relationA, this),
            new MoveToStackGoal(goal, item, relationB, this)
        ];
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public toString(): string {
        return "MoveBidirectional" + this.item + this.relationA + this.relationB + this.goal;
    }

    public explain(previous: string): string {
        return this.parentNode!.explain(previous);
    }
}

class MoveToStackGoal extends CompositeGoal {
    public clearStackGoal: ClearStackGoal;
    public onStackGoal: OnStackGoal;

    public constructor(public item: string, public goal: string, public relation: Relation, parent: NodeGoal) {
        super(parent);
        this.clearStackGoal = new ClearStackGoal(item, this);
        this.onStackGoal = new OnStackGoal(item, this.stackCheck[relation](goal), this);
        this.isFulfilled = this.onStackGoal.isFulfilled;
        this.children = [this.clearStackGoal, this.onStackGoal];
    }

    private stackCheck: {[relation: string]: (goal: string) => (stackId: number, state: NodeLowLevel) => boolean} = {
        rightof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) < stackId;
        },
        leftof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) > stackId;
        }
    };

    public toString(): string {
        return "MoveToStack" + this.item + this.relation + this.goal;
    }

    public explain(previous: string): string {
        const appendix = ` move ${this.item} ${this.relation} ${this.goal}`;
        return this.parentNode!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class OnStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return false;
        }
        return this.stackValid(state.stacks.indexOf(stacks[0]), state);
    }
    public getHeuristicDown = this.getHeuristic;

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       parent: NodeGoal) {
        super(parent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        const itemId = stacks.length === 0 ? state.arm : state.stacks.indexOf(stacks[0]);
        const distances = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state))
            .map((stackId) => stackId - itemId);
        return Math.min.apply(Math, distances);
    }

    public toString(): string {
        return "OnStack" + this.item;
    }

    public explain(previous: string): string {
        return this.parentNode!.explain(previous);
    }
}
