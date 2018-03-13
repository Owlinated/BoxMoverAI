
import {ParserRules, ParserStart} from "./Grammar";
import * as nearley from "../lib/nearley";
import {Command, DNFFormula, ShrdliteResult} from "../core/Types";
import {WorldState} from "../world/World";

/*
 * Parser
 *
 * This module parses a command given as a string by the user into a
 * list of possible parses, each of which contains an object of type 'Command'.
 *
 * You don't have to edit this file.
 */

//////////////////////////////////////////////////////////////////////
// exported functions, classes and interfaces/types

/**
 * The main parse function.
 *
 * @param input: A string with the input from the user.
 * @returns: A list of parse results, each containing an object of type 'Command'.
 *           If there's a parsing error, it throws an error with a string description.
 */
export function parse(input: string): ShrdliteResult[] {
    const NearleyParser = (typeof window !== "undefined") ? window.nearley.Parser : nearley.Parser;
    const the_parser = new NearleyParser(ParserRules, ParserStart);
    // The grammar does not recognise uppercase, whitespace or punctuation,
    // so we make it lowercase and remove all whitespace and punctuation:
    const parsestr = input.toLowerCase().replace(/\W/g, "");
    let results: Command[];
    try {
        results = the_parser.feed(parsestr).results;
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
        input,            // input string
        res.clone(),      // parse result
        new DNFFormula(), // interpretation (placeholder -- will be replaced by the Interpreter)
        []                // plan (placeholder -- will be replaced by the Planner)
    ));
}

// Additional declaration to make the parser work both in Node.js and in the browser.
declare global {
    interface Window {
        nearley: {Parser: {new (rules: {[s: string]: any}, start: string): nearley.Parser}};
    }
}
