import * as nearley from "nearley";
import {Command, DNFFormula, ShrdliteResult} from "../core/Types";
import * as grammar from "./Grammar";

/*
 * Parser
 *
 * This module parses a command given as a string by the user into a
 * list of possible parses, each of which contains an object of type 'Command'.
 */

/**
 * Parses a user input using the nearley grammar.
 * @param input: A string with the input from the user.
 * @returns: A list of parse results, each containing an object of type 'Command'.
 *           If there's a parsing error, it throws an error with a string description.
 */
export function parse(input: string): ShrdliteResult[] {
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));

    // The grammar does not recognise uppercase, whitespace or punctuation,
    // so we make it lowercase and remove all whitespace and punctuation:
    const inputLowerCase = input.toLowerCase().replace(/\W/g, "");
    let results: Command[];
    try {
        results = parser.feed(inputLowerCase).results;
    } catch (err) {
        if ("offset" in err) {
            throw new Error(`Parsing failed after ${err.offset} characters`);
        } else {
            throw err;
        }
    }
    if (results.length === 0) {
        throw new Error("Parsing failed, incomplete input");
    }
    // We need to clone the Nearley parse result, because some parts can be shared with other parses
    return results.map((res) => new ShrdliteResult(
        // input string
        input,
        // parse result
        res.clone(),
        // interpretation (placeholder -- will be replaced by the Interpreter)
        new DNFFormula(),
        // plan (placeholder -- will be replaced by the Planner)
        [],
    ));
}
