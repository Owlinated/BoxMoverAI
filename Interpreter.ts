
import {WorldState} from "./World";

import {
    Command,
    Conjunction, DNFFormula, DropCommand, Entity,
    Literal, Location,
    MoveCommand, Object, RelativeObject,
    ShrdliteResult, SimpleObject, TakeCommand,
} from "./Types";
import * as util from "./lib/typescript-collections/src/lib/util";
import {IDictionaryPair} from "./lib/typescript-collections/src/lib/Dictionary";

/*
 * Interpreter
 *
 * The goal of the Interpreter module is to interpret a sentence
 * written by the user in the context of the current world state.
 * In particular, it must figure out which objects in the world,
 * i.e. which elements in the 'objects' field of WorldState, correspond
 * to the ones referred to in the sentence.
 *
 * Moreover, it has to derive what the intended goal state is and
 * return it as a logical formula described in terms of literals, where
 * each literal represents a relation among objects that should
 * hold. For example, assuming a world state where "a" is a ball and
 * "b" is a table, the command "put the ball on the table" can be
 * interpreted as the literal ontop(a,b). More complex goals can be
 * written using conjunctions and disjunctions of these literals.
 *
 * In general, the module can take a list of possible parses and return
 * a list of possible interpretations, but the code to handle this has
 * already been written for you. The only part you need to implement is
 * the core interpretation function, namely 'interpretCommand', which
 * produces a single interpretation for a single command.
 *
 * You should implement the function 'interpretCommand'.
 */

/**
 * Top-level function for the Interpreter.
 * It calls 'interpretCommand' for each possible parse of the command.
 * You don't have to change this function.
 * @param parses: List of parses produced by the Parser.
 * @param world: The current state of the world.
 * @returns: List of interpretation results, which are the parse results augmented
 *           with interpretations. Each interpretation is represented by a DNFFormula.
 *           If there's an interpretation error, it throws an error with a string description.
 */
export function interpret(parses: ShrdliteResult[], world: WorldState): ShrdliteResult[] {
    const errors: string[] = [];
    const interpretations: ShrdliteResult[] = [];
    const interpreter: Interpreter = new Interpreter(world);
    for (const result of parses) {
        try {
            const intp: DNFFormula = interpreter.interpretCommand(result.parse);
            result.interpretation = intp;
        } catch (err) {
            errors.push(err);
            continue;
        }
        interpretations.push(result);
    }
    if (interpretations.length === 0) {
        // merge all errors into one
        throw errors.join(" ; ");
    }
    return interpretations;
}

/**
 * Interpreter holds a world state and interprets commands based on it.
 * It can read the outputs of the grammar parser and convert them into DNFs for the planner.
 */
class Interpreter {
    constructor(
        private world: WorldState,
    ) {}

    /**
     * The main interpretation method.
     * Note that you should not change the API (type) of this method, only its body.
     * This method should call the mutually recursive methods
     * 'interpretEntity', 'interpretLocation' and 'interpretObject'
     * TODO rewrite and respect world rules (see docs/rules.md)
     * @param cmd: An object of type 'Command'.
     * @returns: A DNFFormula representing the interpretation of the user's command.
     *           If there's an interpretation error, it throws an error with a string description.
     */
    public interpretCommand(cmd: Command): DNFFormula {
        // This currently returns a dummy interpretation involving one or two random objects in the world.
        // Instead it should call the other interpretation methods for
        // each of its arguments (cmd.entity and/or cmd.location).
        let interpretation: DNFFormula;

        const all_objects: string[] = Array.prototype.concat.apply([], this.world.stacks);
        if (this.world.holding) {
            all_objects.push(this.world.holding);
        }

        if (cmd instanceof MoveCommand) {
            const possibleA = this.interpretEntity(cmd.entity);
            const a = all_objects[Math.floor(Math.random() * all_objects.length)];
            const b = all_objects[Math.floor(Math.random() * all_objects.length)];
            if (a === b) {
                throw new Error("Cannot put an object ontop of itself");
            }
            interpretation = new DNFFormula([
                new Conjunction([ // ontop(a, b) & ontop(b, floor)
                    new Literal("ontop", [a, b]),
                    new Literal("ontop", [b, "floor"]),
                ]),
            ]);
        } else if (cmd instanceof TakeCommand) {
            const a = all_objects[Math.floor(Math.random() * all_objects.length)];
            interpretation = new DNFFormula([
                new Conjunction([ // holding(a)
                    new Literal("holding", [a]),
                ]),
            ]);
        } else if (cmd instanceof DropCommand) {
            if (!this.world.holding) {
                throw new Error("I'm not holding anything");
            }
            const a = this.world.holding;
            const b = all_objects[Math.floor(Math.random() * all_objects.length)];
            if (a === b) {
                throw new Error("Cannot put an object ontop of itself");
            }
            interpretation = new DNFFormula([
                new Conjunction([ // ontop(a, b)
                    new Literal("ontop", [a, b]),
                ]),
            ]);
        } else {
            throw new Error("Unknown command");
        }

        return interpretation;
    }

    /**
     * Interpret an entity with relation and object
     * @param {Entity} ent: The entity as parsed by the grammar
     * @returns {EntitySemantics}: The entity to build a DNF from
     */
    public interpretEntity(ent: Entity): EntitySemantics {
        switch (ent.quantifier) {
            case "any":
                // Return all possible objects and tell caller to pick any of them
                return {junction: Junction.Disjunction, objects: this.getObjects(ent.object)};
            case "all":
                // Return all possible object and tell caller to match all of them
                return {junction: Junction.Conjunction, objects: this.getObjects(ent.object)};
            case "the":
                // Find a single object matching the description and resolve ambiguities
                const result = this.resolveAmbiguity(this.getObjects(ent.object));
                return {junction: Junction.Conjunction, objects: [result]};
            default:
                throw new Error(`Unknown quantifier: ${ent.quantifier}`);
        }
    }

    /**
     * Resolve ambiguities between different simple objects
     * @param {SimpleObject[]} objects: Possible objects
     * @returns {SimpleObject} The object desired by the user
     */
    public resolveAmbiguity(objects: SimpleObject[]): SimpleObject {
        // TODO implement as extension (see docs/extensions.md)
        return objects[0];
    }

    /**
     * Interpret a location consisting of a relation to an entity
     * @param {Location} location: The location as parsed by the grammar
     * @returns {LocationSemantics} The location to build a DNF from
     */
    public interpretLocation(location: Location): LocationSemantics {
        const entity = this.interpretEntity(location.entity);
        // TODO check rules for relation (see docs/rules.md)
        switch (location.relation) {
            case "leftof":
                throw new Error("Not implemented");
            case "rightof":
                throw new Error("Not implemented");
            case "beside":
                throw new Error("Not implemented");
            case "inside":
                throw new Error("Not implemented");
            case "ontop":
                throw new Error("Not implemented");
            case "under":
                throw new Error("Not implemented");
            case "above":
                throw new Error("Not implemented");
            default:
                throw new Error(`Unknown relation: ${location.relation}`);
        }
    }

    /**
     * Get all objects within the world, that match the properties of the filter object
     * @param {Object} filterObject The object used to filter by
     * @returns {SimpleObject[]} List of all matching simple objects
     */
    public getObjects(filterObject: Object): SimpleObject[] {
        if (filterObject instanceof SimpleObject) {
            let result = this.getSimpleObjects().filter((simpleObj) => simpleObj.form === filterObject.form);
            if (filterObject.color !== null) {
               result = result.filter((simpleObj) => simpleObj.color === filterObject.color);
            }
            if (filterObject.size !== null) {
               result = result.filter((simpleObj) => simpleObj.size === filterObject.size);
            }
            return result;
        }
        // TODO relative object
        throw new Error("Not implemented");
    }

    /**
     * Get all objects within the world
     * @returns {SimpleObject[]} List of all simple objects
     */
    private getSimpleObjects(): SimpleObject[] {
        const array: SimpleObject[] = [];
        for (const name in this.world.objects) {
            if (util.has(this.world.objects, name)) {
                array.push(this.world.objects[name]);
            }
        }
        return array;
    }

    /**
     * Lookup an objects name in the world
     * @param {SimpleObject} obj: The object to look up
     * @returns {string} The name given to the object in the world
     */
    private getObjectName(obj: SimpleObject): string {
        for (const name in this.world.objects) {
            if (util.has(this.world.objects, name)) {
                if (this.world.objects[name] === obj) {
                    return name;
                }
            }
        }
        throw new Error("Could not find object");
    }

}

// Type of junction for building the DNF
enum Junction { Disjunction, Conjunction}

// Semantics of an entity, describing all objects they (might) refer to
interface EntitySemantics   {junction: Junction; objects: SimpleObject[]; }

// Semantics of a location, contains a relation to an entity
interface LocationSemantics {relation: string; entity: EntitySemantics; }
