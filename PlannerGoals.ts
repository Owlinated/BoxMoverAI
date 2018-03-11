import {aStarSearch} from "./AStarSearch";
import {GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";
import {Conjunction, DNFFormula, Literal, Relation, SimpleObject} from "./Types";
import {WorldState} from "./World";

export abstract class NodeGoal {
    public children: NodeGoal[] = [];
    public abstract evaluate: (state: NodeLowLevel) =>
        {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined};
    public abstract isFulfilled: (state: NodeLowLevel) => boolean;
    // Get heuristic of all necessary paths down to end
    public abstract getHeuristicDown: (state: NodeLowLevel) => number;
    // If a node is a precondition, its children will always be evaluated next
    public precondition: boolean = true;

    public constructor(public parentNode: NodeGoal | undefined) {}

    public getChildren(state: NodeLowLevel, up: boolean): NodeGoal[] {
        if (this.precondition && !up) {
            return this.children.length === 0 ? this.parentNode!.getChildren(state, true) : this.children;
        }

        if (this.isFulfilled(state)) {
            return this.parentNode!.getChildren(state, true);
        }

        const result = this.children.filter((child) => !child.isFulfilled(state));
        if (result.length === 0) {
            return this.parentNode!.getChildren(state, true);
        }
        return result;
    }

    public evaluateLowLevel(state: NodeLowLevel)
        : {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined} {
        if (this.isFulfilled(state)) {
            return this.evaluateSkip(state);
        }

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

    public constructor(parent: NodeGoal) {
        super(parent);
        // Composite goals are never preconditions
        this.precondition = false;
    }

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
        this.precondition = false;
        this.children = dnf.conjuncts.map((conjunction) => new ConjunctionGoal(conjunction, this));
    }

    public getChildren(state: NodeLowLevel, up: boolean): NodeGoal[] {
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
    public constructor(public item: string, parent: NodeGoal) {
        super(parent);
        this.precondition = true;
        const clearStackGoal = new ClearStackGoal(item, this);
        const holdingGoal = new HoldingGoal(item, this);
        clearStackGoal.children.push(holdingGoal);
        this.children.push(clearStackGoal);
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
        result += (stacks[0].length - 1 - stacks[0].indexOf(this.item));
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
    public constructor(public item: string, public goal: string, public relation: Relation, parent: NodeGoal) {
        super(parent);
        const clearStackGoal = new ClearStackGoal(item, this);
        const clearOnStackGoal = new ClearOnStackGoal(item, this.stackCheck[relation](goal), this);
        const onStackGoal = new OnStackGoal(item, this.stackCheck[relation](goal), this);
        clearOnStackGoal.children.push(onStackGoal);
        this.isFulfilled = onStackGoal.isFulfilled;
        this.children = [clearStackGoal, clearOnStackGoal];
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

class ClearOnStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state) && this.isClear(stackId, state));
        return stacks.length > 0;
    }
    public getHeuristicDown = this.getHeuristic;

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       parent: NodeGoal) {
        super(parent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        const stacks = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state));
        const objectA = state.world.objects[this.item];
        const itemCounts: number[] = [];
        for (const stackId of stacks) {
            const stack = state.stacks[stackId];
            for (let i = 1; i <= stack.length; i++) {
                const objectB = state.world.objects[stack[stack.length - i]];
                if (ClearOnStackGoal.canPlace(objectA, objectB)) {
                    itemCounts.push(i);
                    break;
                }
            }
        }
        return Math.min.apply(Math, itemCounts);
    }

    private isClear(stackId: number, state: NodeLowLevel): boolean {
        const dropStack = state.stacks[stackId];
        if (dropStack.length === 0) {
            return true;
        }
        const objectA = state.world.objects[this.item];
        const objectB = state.world.objects[dropStack[dropStack.length - 1]];
        return ClearOnStackGoal.canPlace(objectA, objectB);
    }

    private static canPlace(objectA: SimpleObject, objectB: SimpleObject): boolean {
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

    public toString(): string {
        return "ClearOnStack" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` clear a stack for ${this.item}`;
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
