import {aStarSearch} from "./AStarSearch";
import {Graph, SearchResult, Successor} from "./Graph";
import {Conjunction, DNFFormula, Literal, ShrdliteResult, SimpleObject} from "./Types";
import {WorldState} from "./World";
import {GraphLowLevel, NodeLowLevel} from "./PlannerLowLevel";
import {GraphHighLevel} from "./PlannerHighLevel";
import {FinalNode} from "./PlannerGoals";

/*
 * Planner
 *
 * The goal of the Planner module is to take the interpetation(s)
 * produced by the Interpreter module and to plan a sequence of
 * actions for the robot to put the world into a state compatible
 * with the user's command, i.e. to achieve what the user wanted.
 */

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
    for (const interpretation of interpretations) {
        try {
            const graph = new GraphHighLevel(interpretation.interpretation);
            const search = aStarSearch(graph,
                graph.getStartingNode(world),
                (node) => node.goalNode instanceof FinalNode,
                (node) => 0,
                10);
            interpretation.plan = search.path
                .map((node) => node.action.split(";"))
                .reduce((acc, action) => acc.concat(action), []);
            interpretation.plan.push(`Path with ${search.path.length} moves (${search.visited} visited nodes)`);
        } catch (err) {
            errors.push(err);
            continue;
        }
        if (interpretation.plan.length === 0) {
            interpretation.plan.push("The interpretation is already true!");
        }
        plans.push(interpretation);
    }
    if (plans.length === 0) {
        // merge all errors into one
        throw errors.join(" ; ");
    }
    return plans;
}
