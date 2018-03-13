import {DescribeObjectState} from "../core/Describer";
import {Conjunction, DNFFormula, Literal, Relation, SimpleObject} from "../core/Types";
import {aStarSearch} from "./AStarSearch";
import {canPlace, GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";

/**
 * Node of the tree describing the problem to be solved. Provides methods for
 * tree search, high level nodes use this for the solution search.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export abstract class NodeGoal {
    public children: NodeGoal[] = [];
    public abstract evaluate: (state: NodeLowLevel) =>
        {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined};
    public abstract isFulfilled: (state: NodeLowLevel) => boolean;
    // If a node is a precondition, its children will always be evaluated next
    public precondition: boolean = true;

    public constructor(public heuristicParent: NodeGoal | undefined, public descriptionParent: NodeGoal | undefined) {}

    /**
     * Gets the children of this node.
     * @param  state State to check if goals are fulfilled.
     * @param  up    Direction of tree traversal.
     * @return       The next goal nodes.
     */
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

    /**
     * Find way to satisfy the current goal by running a low level search.
     * @param  state The current state used for calculating a heuristic
     *               and checking if the goal is fulfilled.
     * @return       The result of the low level search.
     */
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
        actions.unshift(this.explain("", state));

        return {
            cost: search.cost, path: actions.join(";"),
            success: search.status === "success",
            state: search.path.length > 0 ? search.path[search.path.length - 1].child : undefined
        };
    }

    /**
     * Skip over the current node instead of evaluating it.
     * @param  state Required by interface
     * @return       Required by interface
     */
    public evaluateSkip(state: NodeLowLevel)
        : {success: boolean, cost: number, path: string, state: NodeLowLevel | undefined} {
        return {success: true, cost: 1, path: "", state: undefined};
    }

    /**
     * Checks if all children are fulfilled.
     * @param  state The state we use to check if a goal is fulfilled.
     * @return       Returns true if every child is fulfilled, false otherwise.
     */
    public allFulfilled(state: NodeLowLevel): boolean {
        return this.children.every((child) => child.isFulfilled(state));
    }

    /**
     * Checks if any child is fulfilled.
     * @param  state The state we use to check if a goal is fulfilled.
     * @return       Returns true if any of the children are fulfilled, false otherwise.
     */
    public someFulfilled(state: NodeLowLevel): boolean {
        return this.children.some((child) => child.isFulfilled(state));
    }

    /**
     * Add a child that will be evaluated after this node and its children.
     * @param  create Creates a child with the given parent.
     * @return        Returns the created child.
     */
    public appendChild(create: (parent: NodeGoal) => NodeGoal) {
        let node: NodeGoal = this;
        while (node.children.length > 0) {
            node = node.children[0];
        }
        const result = create(node);
        node.children.push(result);
        return result;
    }

    /**
     * Get the estimated cost to fulfill this goal.
     * @param  state The state used to estimated the goal.
     * @return       Returns the heuristic.
     */
    public abstract getHeuristic(state: NodeLowLevel): number;

    /**
     * Get the heuristic of all nodes up to the root.
     * @param  state The state used to estimate all the heuristics.
     * @return       Returns the sum of heuristics.
     */
    public getHeuristicUp(state: NodeLowLevel): number {
        return this.getHeuristic(state)
            + (this.heuristicParent === undefined ? 0 : this.heuristicParent!.getHeuristicUp(state));
    }

    /**
     * Explain what the current goal is trying to achieve.
     * @param  previous The childs explanation.
     * @param  state    The state used to get objects from.
     * @return          Human readable explanation.
     */
    public abstract explain(previous: string, state: NodeLowLevel): string;
}

/**
 * Base class for all goals which consist of other goals.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export abstract class CompositeGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.allFulfilled;

    public constructor(heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        // Composite goals are never preconditions
        this.precondition = false;
    }

    public getHeuristic(state: NodeLowLevel): number {
        // Since this node only discovers goals it does not
        // have a heuristic by itself.
        return 0;
    }
}

/**
 * The final node, when this node is reached, the search has succeeded.
 */
export class FinalNode extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = (state: NodeLowLevel) => true;

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public explain(previous: string, state: NodeLowLevel): string {
        return previous;
    }
}

/**
 * Represents the entire DNF being fulfilled.
 * @param dnf The DNF formula that we want to fulfill.
 */
export class DnfGoal extends NodeGoal {
    public evaluate = this.evaluateSkip;
    public isFulfilled = this.someFulfilled;

    public constructor(dnf: DNFFormula) {
        super(undefined, undefined);
        this.precondition = false;
        this.children = dnf.conjuncts.map((conjunction) => new ConjunctionGoal(conjunction, this, this));
    }

    /**
     * Gets the children of this node, if every child is fulfilled, the final node
     * is returned to indicate that the search is over.
     * @param  state The state used to test if children are fulfilled.
     * @param  up    The direction of the tree traversal.
     * @return       Returns unfulfilled children or final node.
     */
    public getChildren(state: NodeLowLevel, up: boolean): NodeGoal[] {
        if (this.isFulfilled(state)) {
            return [new FinalNode(this, this)];
        }
        return this.children.filter((child) => !child.isFulfilled(state));
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    // The root of the explanation, "I do something.".
    public explain(previous: string, state: NodeLowLevel): string {
        return `I ${previous}.`;
    }
}

/**
 * Represents the conjunction term of the DNF.
 * @param conjunction       The conjuction of the DNF.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export class ConjunctionGoal extends CompositeGoal {
    public constructor(public conjunction: Conjunction, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.children = conjunction.literals.map((literal) => this.create(literal));
    }

    public explain(previous: string, state: NodeLowLevel): string {
        return this.descriptionParent!.explain(previous, state);
    }

    /**
     * Creates children for each type of literal in the conjunction.
     * @param  literal The literal to create a node for.
     * @return         Returns the created node.
     */
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
}

/////////////////////
// Composite Goals //
/////////////////////

/**
 * Clears the stack above the item we want to pick up and then picks it up.
 * @param item              The item we want to pick up.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export class PickUpGoal extends CompositeGoal {
    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        this.appendChild((parent) => new ClearStackGoal(item, parent, this));
        const holdingGoal = this.appendChild((parent) => new HoldingGoal(item, parent, this));
        this.isFulfilled = holdingGoal.isFulfilled;
    }

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` pick up ${DescribeObjectState(this.item, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/**
 * Either moves item to goal using relationA or moves goal to item using relation B.
 * @param item              The item we want to move/move to.
 * @param goal              The goal we want to move/move to.
 * @param relationA         The relation for item to goal.
 * @param relationB         The relation for goal to item.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
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
            new MoveToStackGoal(goal, item, relationB, this, this),
        ];
    }

    public getHeuristic(state: NodeLowLevel): number {
        return 0;
    }

    public explain(previous: string, state: NodeLowLevel): string {
        return this.descriptionParent!.explain(previous, state);
    }
}

/**
 * Moves an item to a stack, ignoring the position within the stack. For relations
 * like beside, left of, right of.
 * @param item              The item we want to move.
 * @param goal              The stack we want the item to be in relation with.
 * @param relation          The relation we want the item and goal to be in.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
class MoveToStackGoal extends CompositeGoal {
    /**
     * Functions to produce functions which checks if a specific stack is in
     * relation with the goal item.
     */
    private stackCheck: { [relation: string]: (goal: string) => (stackId: number, state: NodeLowLevel) => boolean } = {
        beside: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : (state.stacks.indexOf(stacks[0]) - 1 === stackId)
                || (state.stacks.indexOf(stacks[0]) + 1 === stackId);
        },
        leftof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) > stackId;
        },
        rightof: (goal: string) => (stackId: number, state: NodeLowLevel) => {
            const stacks = state.stacks.filter((stack) => stack.indexOf(goal) >= 0);
            return stacks.length === 0 ? false : state.stacks.indexOf(stacks[0]) < stackId;
        },
    };

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

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix =
            ` move ${DescribeObjectState(this.item, state)} ${this.relation} ${DescribeObjectState(this.goal, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/**
 * Move an item ontop of a goal by clearing the stack of the goal, picking the item
 * up and moving it ontop of the goal.
 * @param item              The item we want to move.
 * @param goal              The goal to move the item ontop of.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
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

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` move ${DescribeObjectState(this.item, state)} `
            + `ontop ${DescribeObjectState(this.goal, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/**
 * Moves an item above a goal by widening the surface area of the target stack,
 * picking them item up and moving it above the goal.
 * @param item              The item we want to move.
 * @param goal              The goal we want to move the item above.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
class MoveAboveGoal extends CompositeGoal {
    public constructor(public item: string,
                       public goal: string,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
        this.precondition = true;
        const widen = this.appendChild((parent) => new WidenStackGoal(item, goal, parent, this));
        const pick = this.appendChild((parent) => new PickUpGoal(item, parent, this));
        const sameStackGoal =
            this.appendChild((parent) => new SameStackGoal(item, "above", goal, parent, this));
        this.isFulfilled = sameStackGoal.isFulfilled;
    }

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` move ${DescribeObjectState(this.item, state)}`
            + ` above ${DescribeObjectState(this.goal, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/////////////////
// Basic Goals //
/////////////////

/**
 * Makes sure that the arm is holding the item.
 * @param item              The item the arm should hold.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
export class HoldingGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    public isFulfilled = (state: NodeLowLevel) => state.holding === this.item;

    /**
     * Gets the distance between the current position of the arm and the
     * position of the item.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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

    public explain(previous: string, state: NodeLowLevel): string {
        return this.descriptionParent!.explain(previous, state);
    }
}

/**
 * Checks if the item is on the goal stack.
 * @param item             The item we want to check.
 * @param stackValid       Check if the stack is a goal stack.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
export class OnStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    /**
     * Test if the item is on a valid stack
     * @param  state The state to check against.
     * @returns      True if the item is on a valid stack, false otherwise
     */
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.filter((stack) => stack.indexOf(this.item) >= 0);
        if (stacks.length === 0) {
            return false;
        }
        return this.stackValid(state.stacks.indexOf(stacks[0]), state);
    }

    /**
     * Find the distance to the closest stack that is a goal stack.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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

    public explain(previous: string, state: NodeLowLevel): string {
        return this.descriptionParent!.explain(previous, state);
    }
}

/**
 * Widens the surface of a stack to support the item.
 * @param item              The item that needs to be supported.
 * @param goal              The goal with the stack that needs to be widened.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
export class WidenStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string,
                       public goal: string,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    /**
     * Checks if item can be placed ontop of the stack.
     * @param  state The state to check against.
     * @returns      True if the item can be placed above the goal, false otherwise
     */
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

    /**
     * Find the number of items that need to be added ontop of the goal stack
     * to be able to support item.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` widen stack of ${DescribeObjectState(this.item, state)}`
            + ` to accommodate ${DescribeObjectState(this.goal, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/**
 * Checks if two items are on the same stack in a specific relation.
 * @param item              The item that we want to check.
 * @param relation          The relation item and goal need to be in.
 * @param goal              The goal we check against.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export class SameStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string,
                       public relation: Relation,
                       public goal: string,
                       heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    /**
     * Tests if item and goal are in a specific relation
     * @param  state The state to check against.
     * @returns      True if the item is in a specific relation with goal, false otherwise
     */
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

    /**
     * Gets the distance between the item and the goal.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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
        return Math.abs(state.stacks.indexOf(stacksA[0]) - state.stacks.indexOf(stacksB[0]));
    }

    public explain(previous: string, state: NodeLowLevel): string {
        return this.descriptionParent!.explain(previous, state);
    }
}

/**
 * Clears the stack above item.
 * @param item              The item we want to free.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal.
 */
export class ClearStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string, heuristicParent: NodeGoal, descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    /**
     * Check if the item is free.
     * @param  state The state to check against.
     * @returns      True if the item is free, false otherwise
     */
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

    /**
     * Count the number of items above item.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` clear the stack above ${DescribeObjectState(this.item, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }
}

/**
 * Makes sure that we can place item ontop of any goal stack.
 * @param item              The item we want to check.
 * @param stackValid        Check if the stack is a goal stack.
 * @param heuristicParent   Parent whose heuristic should be taken into consideration.
 * @param descriptionParent Parent to ask for descriptions of the goal
 */
export class ClearOnStackGoal extends NodeGoal {
    public evaluate = this.evaluateLowLevel;

    public constructor(public item: string,
                       public stackValid: (stack: number, state: NodeLowLevel) => boolean,
                       heuristicParent: NodeGoal,
                       descriptionParent: NodeGoal) {
        super(heuristicParent, descriptionParent);
    }

    /**
     * Checks if item can be placed ontop of a goal stack.
     * @param  state The state to check against.
     * @returns      True if the item can be placed above a goal stack, false otherwise
     */
    public isFulfilled = (state: NodeLowLevel) => {
        const stacks = state.stacks.map((stack) => state.stacks.indexOf(stack))
            .filter((stackId) => this.stackValid(stackId, state) && this.isClear(stackId, state));
        return stacks.length > 0;
    }

    /**
     * Finds the distance to closest stack that item can be placed on.
     * @param  state The state to determine the heuristic for.
     * @return       Returns the estimated cost.
     */
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

    public explain(previous: string, state: NodeLowLevel): string {
        const appendix = ` clear a stack for ${DescribeObjectState(this.item, state)}`;
        return this.descriptionParent!.explain(previous ? `${previous} to ${appendix}` : appendix, state);
    }

    /**
     * Checks if a stack is empty, or can support the item
     * @param stackId The stack to check.
     * @param  state  The state to check against.
     * @returns       True if the stack is empty or can support the item, false otherwise
     */
    private isClear(stackId: number, state: NodeLowLevel): boolean {
        const dropStack = state.stacks[stackId];
        if (dropStack.length === 0) {
            return true;
        }
        const objectA = state.world.objects[this.item];
        const objectB = state.world.objects[dropStack[dropStack.length - 1]];
        return canPlace(objectA, objectB);
    }
}
