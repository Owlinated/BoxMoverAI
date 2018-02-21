import {WorldState} from "./World";

import {
    Command,
    Conjunction, DNFFormula, DropCommand, Entity,
    Literal, Location,
    MoveCommand, Object, Relation, RelativeObject,
    ShrdliteResult, SimpleObject, TakeCommand,
} from "./Types";

import * as util from "./lib/typescript-collections/src/lib/util";

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
        console.log(result);
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
    constructor(private world: WorldState) {
    }

    /**
     * Floor of world
     */
    private floor = new SimpleObject("floor", null, null);

    public interpretCommand(cmd: Command): DNFFormula {
        const result = this.interpretCommandInternal(cmd);
        if (result.conjuncts.length === 0) {
            throw new Error("Can not interpret command");
        }
        return result;
    }

    /**
     * The main interpretation method.
     * @param cmd: An object of type 'Command'.
     * @returns: A DNFFormula representing the interpretation of the user's command.
     *           If there's an interpretation error, it throws an error with a string description.
     */
    private interpretCommandInternal(cmd: Command): DNFFormula {
        if (cmd instanceof MoveCommand) {
            const entity = this.interpretEntity(cmd.entity);
            const location = this.interpretLocation(cmd.location);

            if (location.entity.junction === Junction.Conjunction) {
                if (entity.junction === Junction.Conjunction) {
                    // all objects && all locations => 1 big conjunction of all combinations 1 term
                    const conjunction: Literal[] = [];
                    for (const object of entity.objects) {
                        for (const constraint of location.entity.objects) {
                            const args = [this.getObjectName(object), this.getObjectName(constraint)];
                            const literal = new Literal(location.relation, args);
                            if (this.isLiteralValid(literal)) {
                                conjunction.push(literal);
                            }
                        }
                    }
                    return new DNFFormula([new Conjunction(conjunction)]);
                } else {
                    // any objects && all locations
                    // (o1c1 o1c2 o1c3) or (o2c1 o2c2 o2c3) or (o3c1 o3c2 o3c3) n terms
                    const disjunction: Conjunction[] = [];
                    for (const constraint of location.entity.objects) {
                        const conjunction: Literal[] = [];
                        for (const object of entity.objects) {
                            const args = [this.getObjectName(object), this.getObjectName(constraint)];
                            const literal = new Literal(location.relation, args);
                            if (this.isLiteralValid(literal)) {
                                conjunction.push(literal);
                            }
                        }
                        if (conjunction.length > 0) {
                            disjunction.push(new Conjunction(conjunction));
                        }
                    }
                    return new DNFFormula(disjunction);
                }
            } else {
                if (entity.junction === Junction.Conjunction) {
                    // all objects && any locations => Disjunction(Conjunction(allobjects))
                    // (o1c1 o2c1 o3c1) or (01c1 o2c1 o3c2) .... exponential growth 2^n terms
                    const counter: number[] = new Array(entity.objects.length);
                    for (let i = 0; i < entity.objects.length; ++i) {
                        counter[i] = 0;
                    }

                    const totalCount = location.entity.objects.length ** entity.objects.length;
                    // Iterate over individual conjunctions
                    const disjunction: Conjunction[] = [];
                    for (let i = 0; i < totalCount; ++i) {
                        const conjunction: Literal[] = [];
                        for (let j = 0; j < entity.objects.length; ++j) {
                            const args = [this.getObjectName(entity.objects[j]),
                                this.getObjectName(location.entity.objects[counter[j]])];
                            const literal = new Literal(location.relation, args);
                            if (this.isLiteralValid(literal)) {
                                conjunction.push(literal);
                            }
                        }
                        if (conjunction.length > 0) {
                            disjunction.push(new Conjunction(conjunction));
                        }

                        // Increment counter (base of constraint count)
                        for (let j = entity.objects.length - 1; j > 0; --j) {
                            counter[j]++;
                            if (counter[j] < location.entity.objects.length) {
                                break;
                            }
                            counter[j] = 0;
                        }
                    }
                    return new DNFFormula(disjunction);
                } else {
                    // any objects && any locations
                    // (o1c1) or (o1c2) or (o1c3) or (o2)... or (o3)... n² terms
                    const disjunction: Conjunction[] = [];
                    for (const object of entity.objects) {
                        for (const constraint of location.entity.objects) {
                            const args = [this.getObjectName(object), this.getObjectName(constraint)];
                            const literal = new Literal(location.relation, args);
                            if (this.isLiteralValid(literal)) {
                                disjunction.push(new Conjunction([literal]));
                            }
                        }
                    }
                    return new DNFFormula(disjunction);
                }
            }
        } else if (cmd instanceof TakeCommand) {
            // We cannot pick up more than one object at a time
            const entity = this.interpretEntity(cmd.entity);
            if (entity.junction === Junction.Conjunction && entity.objects.length > 1) {
                return new DNFFormula([]);
            }

            // One conjunction term per object
            const disjunction: Conjunction[] = [];
            for (const objects of entity.objects) {
                const literal = new Literal("holding", [this.getObjectName(objects)]);
                if (this.isLiteralValid(literal)) {
                    disjunction.push(new Conjunction([literal]));
                }
            }
            return new DNFFormula(disjunction);
        } else if (cmd instanceof DropCommand) {
            if (!this.world.holding) {
                return new DNFFormula([]);
            }

            const location = this.interpretLocation(cmd.location);
            if (location.entity.junction === Junction.Conjunction) {
                // One big conjunction term with all constraints
                const conjunction: Literal[] = [];
                for (const constraint of location.entity.objects) {
                    const args = [this.world.holding, this.getObjectName(constraint)];
                    const literal = new Literal(cmd.location.relation, args);
                    if (this.isLiteralValid(literal)) {
                        conjunction.push(literal);
                    }
                }
                return new DNFFormula([new Conjunction(conjunction)]);
            } else {
                // One conjunction term per constraint
                const disjunction: Conjunction[] = [];
                for (const constraint of location.entity.objects) {
                    const args = [this.world.holding, this.getObjectName(constraint)];
                    const literal = new Literal(cmd.location.relation, args);
                    if (this.isLiteralValid(literal)) {
                        disjunction.push(new Conjunction([literal]));
                    }
                }
                return new DNFFormula(disjunction);
            }
        }
        throw new Error("Unknown command");
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
     * Interpret a location consisting of a relation to an entity
     * @param {Location} location: The location as parsed by the grammar
     * @returns {LocationSemantics} The location to build a DNF from
     */
    public interpretLocation(location: Location): LocationSemantics {
        const entity = this.interpretEntity(location.entity);
        return {relation: location.relation, entity};
    }

    /**
     * Get all objects within the world, that match the properties of the filter object
     * @param {Object} filterObject The object used to filter by
     * @returns {SimpleObject[]} List of all matching simple objects
     */
    public getObjects(filterObject: Object): SimpleObject[] {
        if (filterObject instanceof SimpleObject) {
            let result = this.getSimpleObjects();
            if (filterObject.form !== "anyform") {
                result = result.filter((simpleObj) => simpleObj.form === filterObject.form);
            }
            if (filterObject.color !== null) {
                result = result.filter((simpleObj) => simpleObj.color === filterObject.color);
            }
            if (filterObject.size !== null) {
                result = result.filter((simpleObj) => simpleObj.size === filterObject.size);
            }
            return result;
        } else {
            const result = this.getObjects(filterObject.object);
            const location = this.interpretLocation(filterObject.location);
            return this.filterObjectsByLocation(result, location);
        }
    }

    /**
     * Resolve ambiguities between different simple objects
     * @param {SimpleObject[]} objects: Possible objects
     * @returns {SimpleObject} The object desired by the user
     */
    private resolveAmbiguity(objects: SimpleObject[]): SimpleObject {
        // TODO implement as extension (see docs/extensions.md)
        return objects[0];
    }

    /**
     * Checks if a literal complies with rules
     * @param {Literal} literal: The literal to check
     * @returns {boolean} True if literal is allowed by rules, false otherwise
     */
    private isLiteralValid(literal: Literal): boolean {
        // Cannot manipulate the floor
        if (literal.args.length > 0 && literal.args[0] === this.getObjectName(this.floor)) {
            return false;
        }

        // Check holding separately
        if (literal.relation === "holding") {
            return true;
        }

        // All other relations take two arguments (for now)
        if (literal.args.length !== 2) {
            return false;
        }
        const objectA = this.getObject(literal.args[0]);
        const objectB = this.getObject(literal.args[1]);
        if (objectA === objectB) {
            return false;
        }

        // Apply rules specific to relations
        switch (literal.relation) {
            case "leftof":
                return true;
            case "rightof":
                return true;
            case "inside":
                if (objectB.form !== "box") {
                    return false;
                }
                if (objectA.size === "large" && objectB.size === "small") {
                    return false;
                }
                if (objectA.form === "pyramid" || objectA.form === "plank" || objectA.form === "box") {
                    if (objectB.size === "small" || objectA.size === "large") {
                        return false;
                    }
                }
                return true;
            case "ontop":
                if (objectB.form === "box" || objectB.form === "ball") {
                    return false;
                }
                if (objectA.form === "ball" && objectB !== this.floor) {
                    return false;
                }
                if (objectA.size === "large" && objectB.size === "small") {
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
                return true;
            case "under":
                if (objectA.form === "ball") {
                    return false;
                }
                if (objectA.size === "small" && objectB.size === "large") {
                    return false;
                }
                return true;
            case "beside":
                return true;
            case "above":
                if (objectB.form === "ball") {
                    return false;
                }
                if (objectB.size === "small" && objectA.size === "large") {
                    return false;
                }
                return true;
            default:
                throw new Error(`Unknown relation: ${literal.relation}`);
        }
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
        array.push(this.floor);
        return array;
    }

    /**
     * Dictionary of functions that say if objectA is in a specific relation to objectB
     */
    private relationTesters: { [relation: string]: RelationTesterFunction; } = {
        leftof: (objectA, stackA, objectB, stackB) => stackA !== undefined && stackB !== undefined && stackA < stackB,
        rightof: (objectA, stackA, objectB, stackB) => stackA !== undefined && stackB !== undefined && stackA > stackB,
        beside: (objectA, stackA, objectB, stackB) =>
            (stackA !== undefined && stackA - 1 === stackB) || (stackB !== undefined && stackA === stackB - 1),
        inside: (objectA, stackA, objectB, stackB) =>
            stackA === stackB && stackA !== undefined
            && this.world.stacks[stackA].indexOf(this.getObjectName(objectA)) - 1
            === this.world.stacks[stackA].indexOf(this.getObjectName(objectB))
            && objectB.form === "box",
        ontop: (objectA, stackA, objectB, stackB) => {
            if (objectB === this.floor) {
                return stackA !== undefined && this.world.stacks[stackA].indexOf(this.getObjectName(objectA)) === 0;
            }
            return stackA === stackB && stackA !== undefined
                && this.world.stacks[stackA].indexOf(this.getObjectName(objectA)) - 1
                === this.world.stacks[stackA].indexOf(this.getObjectName(objectB))
                && objectB.form !== "box";
        },
        under: (objectA, stackA, objectB, stackB) =>
            stackA === stackB && stackA !== undefined
            && this.world.stacks[stackA].indexOf(this.getObjectName(objectA)) <
            this.world.stacks[stackA].indexOf(this.getObjectName(objectB)),
        above: (objectA, stackA, objectB, stackB) => {
            if (objectB === this.floor) {
                return true;
            }
            return stackA === stackB && stackA !== undefined
                && this.world.stacks[stackA].indexOf(this.getObjectName(objectA)) >
                this.world.stacks[stackA].indexOf(this.getObjectName(objectB));
        }
    };

    /**
     * Interpret a location consisting of a relation to an entity
     * @param {SimpleObject[]} objects: Objects to filter by location
     * @param {Location} filterLocation: The location as parsed by the grammar
     * @returns {LocationSemantics} The objects that are in the described location
     */
    private filterObjectsByLocation(objects: SimpleObject[], filterLocation: LocationSemantics): SimpleObject[] {
        const result: SimpleObject[] = [];

        for (const object of objects) {
            const relationTester = (objectA: SimpleObject, objectB: SimpleObject): boolean => {
                const stackA = this.getStackId(objectA);
                const stackB = this.getStackId(objectB);
                if ((stackA === undefined && objectA !== this.floor)
                    || (stackB === undefined && objectB !== this.floor)) {
                    return false;
                }
                return this.relationTesters[filterLocation.relation](objectA, stackA, objectB, stackB);
            };
            const isInRelation = filterLocation.entity.junction === Junction.Conjunction
                ? filterLocation.entity.objects.every((locationObject) => relationTester(object, locationObject))
                : filterLocation.entity.objects.some((locationObject) => relationTester(object, locationObject));
            if (isInRelation) {
                result.push(object);
            }
        }

        return result;
    }

    private checkLarge(objs: SimpleObject[]): boolean {
        let hasLarge: boolean = false;
        objs.forEach((testLength) => {
            if (testLength.size === "large") {
                hasLarge = true;
            }
        });
        return hasLarge;
    }

    private checkSmall(objs: SimpleObject[]): boolean {
        let hasSmall: boolean = false;
        objs.forEach((testSmall) => {
            if (testSmall.size === "small") {
                hasSmall = true;
            }
        });
        return hasSmall;
    }

    /**
     * Lookup an objects name in the world
     * @param {SimpleObject} obj: The object to look up
     * @returns {string} The name given to the object in the world
     */
    private getObjectName(obj: SimpleObject): string {
        if (obj === this.floor) {
            return "floor";
        }
        for (const name in this.world.objects) {
            if (util.has(this.world.objects, name)) {
                if (this.world.objects[name] === obj) {
                    return name;
                }
            }
        }
        throw new Error("Could not find object");
    }

    /**
     * Lookup an objects by its name in the world
     * @param {SimpleObject} name: The name of the object to look up
     * @returns {string} The object matching the name
     */
    private getObject(name: string): SimpleObject {
        if (name === "floor") {
            return this.floor;
        }
        return this.world.objects[name];
    }

    /**
     * Get number of stack containing object
     * @param {SimpleObject} object: Object to get stack for
     * @returns {number | undefined} The identifier of the stack containing object
     * or undefined if no stack contains object
     */
    private getStackId(object: SimpleObject): number | undefined {
        const stacks = this.world.stacks
            .filter((stack) => stack.some((obj) => this.getObject(obj) === object));

        if (stacks.length === 0) {
            return undefined;
        }
        return this.world.stacks.indexOf(stacks[0]);
    }
}

// Type of junction for building the DNF
enum Junction { Disjunction, Conjunction}

// Semantics of an entity, describing all objects they (might) refer to
interface EntitySemantics {
    junction: Junction;
    objects: SimpleObject[];
}

// Semantics of a location, contains a relation to an entity
interface LocationSemantics {
    relation: Relation;
    entity: EntitySemantics;
}

type RelationTesterFunction =
    (objectA: SimpleObject, stackA: number | undefined, objectB: SimpleObject, stackB: number | undefined) => boolean;
