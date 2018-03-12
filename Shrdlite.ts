import {AmbiguityError} from "./AmbiguityError";
import {interpret} from "./Interpreter";
import {parse} from "./Parser";
import {plan} from "./Planner";
import {Clarification, DNFFormula, Entity, Location, MoveCommand, ShrdliteResult, SimpleObject} from "./Types";
import {World} from "./World";

/********************************************************************************
** Shrdlite

This module contains toplevel functions for the interaction loop, and
the pipeline that calls the parser, the interpreter and the planner.

You should do some minor changes to the function 'parseUtteranceIntoPlan',
look for PLACEHOLDER below.
Everything else can be left as they are.
********************************************************************************/

let Command: ShrdliteResult[] | undefined;
const Clarifications: Clarification[][] = [];

/**
 * Generic function that takes an utterance and returns a plan. It works according to the following pipeline:
 * - first it parses the utterance (Parser.ts)
 * - then it interprets the parse(s) (Interpreter.ts)
 * - then it creates plan(s) for the interpretation(s) (Planner.ts)
 *
 * Each of the modules Parser.ts, Interpreter.ts and Planner.ts
 * defines its own version of interface Result, which in the case
 * of Interpreter.ts and Planner.ts extends the Result interface
 * from the previous module in the pipeline. In essence, starting
 * from ParseResult, each module that it passes through adds its
 * own result to this structure, since each Result is fed
 * (directly or indirectly) into the next module.
 *
 * There are two sources of ambiguity: a parse might have several
 * possible interpretations, and there might be more than one plan
 * for each interpretation. In the code there are commented placeholders
 * that you can fill in to decide what to do in each case.
 * These placeholders are marked PLACEHOLDER.
 *
 * @param world: The current world.
 * @param utterance: The string that represents the command.
 * @returns: A plan in the form of a stack of strings, where each element
 *           is either a robot action, like "p" (for pick up) or "r" (for going right),
 *           or a system utterance in English that describes what the robot is doing.
 */
export function parseUtteranceIntoPlan(world: World, utterance: string): string[] | null | string {
    let parses;
    let interpretations;
    let plans: string | ShrdliteResult[];

    // see if utterance is dnf, parse it, pass shrdliteresults to planner
    if (utterance.slice(0, 4) === "dnf ") {
        const ent: Entity = new Entity("the", new SimpleObject("anyform", null, null));
        const loca: Location = new Location("ontop", ent);
        interpretations = [new ShrdliteResult(utterance,
            new MoveCommand(ent, loca),
            DNFFormula.parse(utterance.slice(4)),
            [])];
    } else {
        // Call the parser with the utterance, and then log the parse results
        world.printDebugInfo(`Parsing utterance: "${utterance}"`);
        try {
            parses = parse(utterance);
        } catch (err) {
            world.printError("[Parsing failure]", err);
            return null;
        }
        world.printDebugInfo(`Found ${parses.length} parses`);
        parses.forEach((result, n) => {
            world.printDebugInfo(`  (${n}) ${result.parse.toString()}`);
        });

        if (parses.some((parse) => parse.parse instanceof Clarification)) {
            if (Command === undefined) {
                world.printError("Expected an instruction, please enter a command.");
                return null;
            }
            Clarifications.push(parses.map((parse) => parse.parse as Clarification));
        } else {
            Command = parses;
            Clarifications.length = 0;
        }

        // Call the interpreter for all parses, and then log the interpretations
        try {
            interpretations = interpret(Command, Clarifications, world.currentState);
            Command = undefined;
            Clarifications.length = 0;
        } catch (err) {
            if (err instanceof AmbiguityError) {
                return err.message;
            }
            world.printError("[Interpretation failure]", err);
            return null;
        }
        world.printDebugInfo(`Found ${interpretations.length} interpretations`);
        interpretations.forEach((result, n) => {
            world.printDebugInfo(`  (${n}) ${result.interpretation.toString()}`);
        });
    }

    // Call the planner for all interpretations, and then log the resulting plans
    try {
        plans = plan(interpretations, world.currentState);
    } catch (err) {
        world.printError("[Planning failure]", err);
        return null;
    }
    world.printDebugInfo(`Found ${plans.length} plans`);
    plans.forEach((result, n) => {
        world.printDebugInfo(`  (${n}) ${result.plan.toString()}`);
    });

    let finalPlan: string[] = [];
    if (plans.length === 1) {
        // if only one plan was found, it's the one we return
        finalPlan = plans[0].plan;
    } else {
        // PLACEHOLDER:
        // several plans were found -- how should this be handled?
        // this means that we have several interpretations and one plan for each of them,
        // should we throw an ambiguity error?
        // ... throw new Error("Ambiguous utterance");
        // or should we ask the user?
        // or should we select the interpretation with the shortest plan?
        plans.sort((a, b) => a.plan.length - b.plan.length);
        finalPlan = plans[0].plan;
    }

    // Log the final plan, and return it
    world.printDebugInfo("Final plan: " + finalPlan.join(", "));
    return finalPlan;
}

/*
 * A convenience function that recognizes strings of the form "p r r d l p r d".
 * You don't have to change this function.
 */
export function splitStringIntoPlan(planstring: string): string[] | null {
    const theplan: string[] = planstring.trim().split(/\s+/);
    const actions: {[act: string]: string}
        = {p: "Picking", d: "Dropping", l: "Going left", r: "Going right"};
    for (let i = theplan.length - 1; i >= 0; i--) {
        if (!actions[theplan[i]]) {
            return null;
        }
        theplan.splice(i, 0, actions[theplan[i]]);
    }
    return theplan;
}
