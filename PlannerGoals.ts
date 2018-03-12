import {aStarSearch} from "./AStarSearch";
import {GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";
import {Conjunction, DNFFormula, Literal, Relation, SimpleObject} from "./Types";

export abstract class NodeGoal {
    public children: NodeGoal[] = [];
    public abstract evaluate: (state: NodeLowLevel) =>
        {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined};
    public abstract isFulfilled: (state: NodeLowLevel) => boolean;
    // If a node is a precondition, its children will always be evaluated next
    public precondition: boolean = true;

    public constructor(public heuristicParent: NodeGoal | undefined, public descriptionParent: NodeGoal | undefined) {}

    public getChildren(state: NodeLowLevel, up: boolean): NodeGoal[] {
        if (this.precondition) {
            if (up) {
                return this.heuristicParent!.getChildren(state, true);
            } else {
                return this.children.length === 0 ? this.heuristicParent!.getChildren(state, true) : this.children;
            }
        }

        if (this.isFulfilled(state)) {
            return this.heuristicParent!.getChildren(state, true);
        }

        const result = this.children.filter((child) => !child.isFulfilled(state));
        if (result.length === 0) {
            return this.heuristicParent!.getChildren(state, true);
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
            (node) => 0.5 * this.getHeuristic(node) + 0.5 * this.getHeuristicUp(node),
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
        return {success: true, cost: 1, path: "", state: undefined};
    }

    public allFulfilled(state: NodeLowLevel): boolean {
        return this.children.every((child) => child.isFulfilled(state));
    }

    public someFulfilled(state: NodeLowLevel): boolean {
        return this.children.some((child) => child.isFulfilled(state));
    }

    public appendChild(create: (parent: NodeGoal) => NodeGoal) {
        let node: NodeGoal = this;
        while (node.children.length > 0) {
            node = node.children[0];
        }
        const result = create(node);
        node.children.push(result);
        return result;
    }

    // Get this nodes heuristic
    public abstract getHeuristic(state: NodeLowLevel): number;

    // Get heuristic of all necessary paths up to root
    public getHeuristicUp(state: NodeLowLevel): number {
        return this.getHeuristic(state)
            + (this.heuristicParent === undefined ? 0 : this.heuristicParent!.getHeuristicUp(state));
    }

    public abstract toString(): string;

    public abstract explain(previous: string): string;
}

export abstract class CompositeGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.allFulfilled;

    public constructor(heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
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

    public constructor(dnf: DNFFormula) {
        super(undefined, undefined);
        this.precondition = false;
        this.children = dnf.conjuncts.map((conjunction) => new ConjunctionGoal(conjunction, this, this));
    }

    public getChildren(state: NodeLowLevel, up: boolean): NodeGoal[] {
        if (this.isFulfilled(state)) {
            return [new FinalNode(this, this)];
        }
        return this.children.filter((child) => !child.isFulfilled(state));
    }

    public getHeuristic(state: NodeLowLevel): number {
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
    public constructor(public conjunction: Conjunction, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.children = conjunction.literals.map((literal) => this.create(literal));
    }

    private create(literal: Literal): NodeGoal {
        if (literal.relation === "holding") {
            return new PickUpGoal(literal.args[0], this, this);
        }
        if (literal.args.length !== 2) {
            throw new Error("Unexpected number of arguments");
        }
        switch (literal.relation) {
            case "leftof":
                return new MoveBidirectionalGoal(literal.args[0], literal.args[1], "leftof", "rightof", this, this);
            case "rightof":
                return new MoveBidirectionalGoal(literal.args[0], literal.args[1], "rightof", "leftof", this, this);
            case "beside":
                return new MoveBidirectionalGoal(literal.args[0], literal.args[1], "beside", "beside", this, this);
            case "inside":
            /* falls through */
            case "ontop":
                return new MoveOnTopGoal(literal.args[0], literal.args[1], this, this);
            case "under":
                literal.args = literal.args.reverse();
            /* falls through */
            case "above":
                return new MoveAboveGoal(literal.args[0], literal.args[1], this, this);
            default:
                throw new Error(`Unknown relation: ${literal.relation}`);
        }
    }

    public toString(): string {
        return "Conjunction" + this.conjunction.toString();
    }

    public explain(previous: string): string {
        const appendix = ` fulfill ${this.conjunction.toString()}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

export class PickUpGoal extends CompositeGoal {
    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        this.appendChild((parent) => new ClearStackGoal(item, parent, this));
        const holdingGoal = this.appendChild((parent) => new HoldingGoal(item, parent, this));
        this.isFulfilled = holdingGoal.isFulfilled;
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "PickUp" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` pick up ${this.item}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class HoldingGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => state.holding === this.item;

    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
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
        return this.heuristicParent!.toString() + "Holding" + this.item;
    }

    public explain(previous: string): string {
        return this.heuristicParent!.explain(previous);
    }
}

class ClearStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        if (this.item === "floor") {
            return state.world.stacks.some((stack) => stack.length === 0);
        }
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return false;
        }
        return stacks[0].indexOf(this.item) === stacks[0].length - 1;
    }

    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
        let result = 0;
        if (this.item === "floor") {
            const minFloor = Math.min.apply(Math, state.world.stacks.map((stack) => stack.length));
            const minDistanceFloor = Math.min.apply(Math, state.world.stacks
                .filter((stack) => stack.length === minFloor)
                .map((stack) => Math.abs(state.world.stacks.indexOf(stack) - state.arm)));
            result += minDistanceFloor;
            result += minFloor;
        } else {
            const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
            if (stacks.length === 0) {
                return 0;
            }
            result += Math.abs(state.arm - state.stacks.indexOf(stacks[0]));
            result += (stacks[0].length - 1 - stacks[0].indexOf(this.item));
        }
        if (state.holding !== undefined) {
            result++;
        }
        return result;
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "ClearStack" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` clear the stack above ${this.item}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class MoveBidirectionalGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.someFulfilled;

    public constructor(public item: string,
                       public goal: string,
                       public relationA: Relation,
                       public relationB: Relation,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.children = [
            new MoveToStackGoal(item, goal, relationA, this, this),
            new MoveToStackGoal(goal, item, relationB, this, this)
        ];
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public toString(): string {
        return this.heuristicParent!.toString()
            + "MoveBidirectionalGoal" + this.item + this.relationA + this.relationB + this.goal;
    }

    public explain(previous: string): string {
        return this.heuristicParent!.explain(previous);
    }
}

class MoveToStackGoal extends CompositeGoal {
    public constructor(public item: string,
                       public goal: string,
                       public relation: Relation,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        this.appendChild((parent) => new ClearOnStackGoal(item, this.stackCheck[relation](goal), parent, this));
        this.appendChild((parent) => new PickUpGoal(item, parent, this));
        const onStackGoal =
            this.appendChild((parent) => new OnStackGoal(item, this.stackCheck[relation](goal), parent, this));
        this.isFulfilled = onStackGoal.isFulfilled;
    }

    private stackCheck: {[relation: string]: (goal: string) => (stackId: number, state: NodeLowLevel) => boolean} = {
        rightof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) < stackId;
        },
        leftof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) > stackId;
        },
        beside: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : (state.stacks.indexOf(stacks[0]) - 1 === stackId)
                || (state.stacks.indexOf(stacks[0]) + 1 === stackId);
        }
    };

    public toString(): string {
        return this.heuristicParent!.toString() + "MoveToStack" + this.item + this.relation + this.goal;
    }

    public explain(previous: string): string {
        const appendix = ` move ${this.item} ${this.relation} ${this.goal}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class ClearOnStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state) && this.isClear(stackId, state));
        return stacks.length > 0;
    }

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
        const stacks = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state));
        const objectA = state.world.objects[this.item];
        const stacksA = state.stacks.filter((stack) => state.stacks.indexOf(stack) >= 0);
        const indexA = stacksA.length === 0 ? state.arm : state.stacks.indexOf(stacksA[0]);
        const results = [];
        for (const stackId of stacks) {
            const stack = state.stacks[stackId];
            for (let i = 0; i <= stack.length; i++) {
                const objectB = state.world.objects[stack[stack.length - 1 - i]];
                if (canPlace(objectA, objectB)) {
                    results.push(i + Math.abs(indexA - stackId));
                    break;
                }
            }
        }
        return Math.min.apply(Math, results);
    }

    private isClear(stackId: number, state: NodeLowLevel): boolean {
        const dropStack = state.stacks[stackId];
        if (dropStack.length === 0) {
            return true;
        }
        const objectA = state.world.objects[this.item];
        const objectB = state.world.objects[dropStack[dropStack.length - 1]];
        return canPlace(objectA, objectB);
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "ClearOnStack" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` clear a stack for ${this.item}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
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

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        const itemId = stacks.length === 0 ? state.arm : state.stacks.indexOf(stacks[0]);
        const distances = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state))
            .map((stackId) => stackId - itemId);
        return Math.min.apply(Math, distances);
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "OnStack" + this.item;
    }

    public explain(previous: string): string {
        return this.heuristicParent!.explain(previous);
    }
}

// clear items above goal, pickupitem, SameStackRelationGoal
class MoveOnTopGoal extends CompositeGoal {
    public constructor(public item: string,
                       public goal: string,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        this.appendChild((parent) => new ClearStackGoal(goal, parent, this));
        this.appendChild((parent) => new PickUpGoal(item, parent, this));
        const sameStackGoal =
            this.appendChild((parent) => new SameStackGoal(item, "ontop", goal, parent, this));
        this.isFulfilled = sameStackGoal.isFulfilled;
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "MoveOnTop" + this.item + this.goal;
    }

    public explain(previous: string): string {
        const appendix = ` move ${this.item} ontop ${this.goal}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class MoveAboveGoal extends CompositeGoal {
    public constructor(public item: string,
                       public goal: string,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        const widen = this.appendChild((parent) => new WidenStackGoal(item, goal, parent, this));
        // const pick = this.appendChild((parent) => new PickUpGoal(item, parent, this));
        const sameStackGoal =
            this.appendChild((parent) => new SameStackGoal(item, "above", goal, parent, this));
        this.isFulfilled = sameStackGoal.isFulfilled;
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "MoveAbove" + this.item + this.goal;
    }

    public explain(previous: string): string {
        const appendix = ` move ${this.item} above ${this.goal}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

class WidenStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        if (this.goal === "floor") {
            return true;
        }
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.goal) >= 0);
        if (stacks.length === 0) {
            return false;
        }
        const goalStack = stacks[0];
        if (goalStack.indexOf(this.item) >= 0) {
            return true;
        }
        const goalObject = state.world.objects[goalStack[goalStack.length - 1]];
        const itemObject = state.world.objects[this.item];
        return canPlace(itemObject, goalObject);
    }

    public constructor(public item: string,
                       public goal: string,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.goal) >= 0);
        if (stacks.length === 0) {
            return 0;
        }
        const goalStack = stacks[0];
        const goalObject = state.world.objects[goalStack[goalStack.length - 1]];
        let itemObject = state.world.objects[this.item];
        let result = 0;
        while (!canPlace(itemObject, goalObject)) {
            result++;
            if (result > 10) {
                break;
            }
            const bases = Object.keys(state.world.objects)
                .map((name) => state.world.objects[name])
                .filter((object) => canPlace(itemObject, object));
            let supportCountMax = 0;
            let newItem: SimpleObject | undefined;
            for (const base of bases) {
                 const supportCount = Object.keys(state.world.objects)
                    .map((name) => state.world.objects[name])
                    .filter((object) => canPlace(base, object))
                    .length;
                 if (supportCount > supportCountMax) {
                     supportCountMax = supportCount;
                     newItem = base;
                 }
            }
            itemObject = newItem!;
        }
        return result * 10;
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "WidenStack" + this.item;
    }

    public explain(previous: string): string {
        const appendix = ` widen stack of ${this.item} to acoomodate ${this.goal}`;
        return this.heuristicParent!.explain(previous ? `${previous} to ${appendix}` : appendix);
    }
}

// above & ontop
class SameStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;
    public isFulfilled = (state: NodeLowLevel) => {
        const stacksA = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacksA.length === 0) {
            return false;
        }
        const indexA = state.stacks.indexOf(stacksA[0]);
        const stackIndexA = stacksA[0].indexOf(this.item);
        if (this.goal !== "floor") {
            const stacksB = state.stacks.filter((stack) => stack.indexOf(this.goal) >= 0);
            if (stacksB.length === 0) {
                return false;
            }
            const indexB = state.stacks.indexOf(stacksB[0]);
            if (indexA !== indexB) {
                return false;
            }
            const stackIndexB = stacksB[0].indexOf(this.goal);

            switch (this.relation) {
                case "above":
                    return stackIndexA > stackIndexB;
                case "ontop":
                    return stackIndexA - 1 === stackIndexB;
                default:
                    throw new Error("SameStackGoal only handles above and ontop, not " + this.relation);
            }
        } else {
            switch (this.relation) {
                case "above":
                    return stackIndexA >= 0;
                case "ontop":
                    return stackIndexA === 0;
                default:
                    throw new Error("SameStackGoal only handles above and ontop, not " + this.relation);
            }
        }
    }

    public constructor(public item: string,
                       public relation: Relation,
                       public goal: string,
                       heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public getHeuristic(state: NodeLowLevel): number {
        if (this.isFulfilled(state)) {
            return 0;
        }
        const stacksA = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        const stacksB = state.stacks.filter((stack) => stack.indexOf(this.goal) >= 0);
        if (stacksA.length === 0 || stacksB.length === 0) {
            const stackID = stacksA.length === 0 ? state.stacks.indexOf(stacksB[0]) : state.stacks.indexOf(stacksA[0]);
            return Math.abs(stackID - state.arm);
        }
        return Math.abs(state.stacks.indexOf(stacksA[0]) -  state.stacks.indexOf(stacksB[0]));
    }

    public toString(): string {
        return this.heuristicParent!.toString() + "SameStack" + this.item + this.relation + this.goal;
    }

    public explain(previous: string): string {
        return this.heuristicParent!.explain(previous);
    }
}

function canPlace(objectA: SimpleObject, objectB: SimpleObject): boolean {
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
