import {ShrdliteResult} from "../core/Types";
import {interpret} from "../interpreter/Interpreter";
import {parse} from "../parser/Parser";
import {ExampleWorlds} from "../world/ExampleWorlds";
import {TextWorld} from "../world/TextWorld";
import {TestCase, testCases} from "./InterpreterTestCases";

/********************************************************************************
** test-interpreter

This is the main file for testing the interpreter implementation in Interpreter.ts.
It tests against several test cases that are defined in InterpreterTestCases.ts

You should not edit this file.
********************************************************************************/

function runTest(testcase: TestCase): boolean {
    const world = new TextWorld(ExampleWorlds[testcase.world]);
    const utterance = testcase.utterance;

    let parses: ShrdliteResult[];
    try {
        parses = parse(utterance);
    } catch (err) {
        console.log("ERROR: Parsing error!", err);
        console.log();
        return false;
    }
    console.log("Found " + parses.length + " parses");
    console.log();

    function cleanup(intp: string): string {
        return intp.replace(/\s/g, "").replace(/\&/g, " & ").replace(/\|/g, " | ");
    }

    const correctints: string[] = testcase.interpretations.map(cleanup).sort();
    let interpretations: string[] = [];
    try {
        const intps: ShrdliteResult[] = interpret(parses, [], world.currentState);
        interpretations = intps.map(
            (intp) => cleanup(intp.interpretation.toString())
        ).sort()
            .filter((intp, n, sorted_intps) => intp !== sorted_intps[n - 1]); // only keep unique interpretations
    } catch (err) {
        console.log("ERROR: Interpretation error!", err);
        console.log();
    }

    console.log("Correct interpretations:");
    let n = 0;
    interpretations.forEach((intp) => {
        if (correctints.some((i) => i === intp)) {
            n++;
            console.log(`    (${n}) ${intp}`);
        }
    });
    if (n === correctints.length && n === interpretations.length) {
        if (n === 0) {
            console.log("    There are no interpretations");
        }
        console.log();
        console.log("Everything is correct!");
        console.log();
        return true;
    }
    if (n === 0) {
        console.log("    No correct interpretations");
    }
    console.log();

    if (n < correctints.length) {
        console.log("Missing interpretations:");
        correctints.forEach((intp) => {
            if (!interpretations.some((j) => j === intp)) {
                console.log("    (-) " + intp);
            }
        });
        console.log();
    }
    if (n < interpretations.length) {
        console.log("Incorrect interpretations:");
        interpretations.forEach((intp) => {
            if (!correctints.some((i) => i === intp)) {
                n++;
                console.log("    (" + n + ") " + intp);
            }
        });
        console.log();
    }
    interpretations.forEach((intp) => {
        if (!correctints.some((i) => isInterpretationMatch(i, intp))) {
            console.log("Truly Incorrect interpretations:");
            console.log("    (" + n + ") " + intp);
            console.log("");
        }
    });
    return false;
}

function isInterpretationMatch(test: string, correct: string) {
    const testSplit = test.split(" | ");
    const correctSplit = correct.split(" | ");
    if (testSplit.length !== correctSplit.length) {
        return false;
    }

    testSplit.sort();
    correctSplit.sort();
    for (let i = 0; i < testSplit.length; ++i) {
        if (testSplit[i] !== correctSplit[i]) {
            return false;
        }
    }
    return true;
}

function runAllTests(argv: string[]) {
    let tests: number[] = [];
    if (argv.length === 0) {
        throw new Error("Missing command-line arguments");
    } else if (argv[0] === "all") {
        for (let n = 0; n < testCases.length; n++) { tests.push(n); }
    } else {
        tests = argv.map((n) => parseInt(n, 10));
    }

    let failed = 0;
    for (const n of tests) {
        const testcase: TestCase = testCases[n];
        console.log("================================================================================================");
        console.log("Testing utterance " + n + ': "' + testcase.utterance + '", in world "' + testcase.world + '"');
        const result = runTest(testCases[n]);
        if (!result) { failed++; }
    }

    console.log("================================================================================================");
    console.log("Summary statistics");
    console.log();
    console.log("Passed tests: " + (tests.length - failed));
    console.log("Failed tests: " + failed);
    console.log();
}

try {
    runAllTests(process.argv.slice(2));
} catch (err) {
    console.log();
    console.log("ERROR: " + err);
    console.log();
    console.log("Please give at least one argument:");
    console.log("- either a number (0.." + (testCases.length - 1) + ") for each test you want to run,");
    console.log("- or 'all' for running all tests.");
    console.log();
}
