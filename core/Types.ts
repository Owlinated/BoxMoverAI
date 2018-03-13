
/*
 * Types
 *
 * This module contains type and class declarations for parse results and interpretations.
 *
 * You don't have to edit this file (unless you add things to the grammar).
 */

export class ShrdliteResult {
    constructor(
        public input: string,
        public parse: Command,
        public interpretation: DNFFormula,
        public plan: string[],
    ) {}
}

//////////////////////////////////////////////////////////////////////
// Parse results

export type Command =
      TakeCommand
    | DropCommand
    | MoveCommand
    | Clarification
/*
// Here's an example of a new command
// Don't forget to add a class definition below
// The corresponding grammar rule(s) must also be added to Grammar.ne
    | WhereisCommand
*/
;

export class TakeCommand {
    constructor(public entity: Entity) {}
    public toString(): string {return `TakeCommand(${this.entity.toString()})`; }
    public clone(): TakeCommand {return new TakeCommand(this.entity.clone()); }
}

export class DropCommand {
    constructor(public location: Location) {}
    public toString(): string {return `DropCommand(${this.location.toString()})`; }
    public clone(): DropCommand {return new DropCommand(this.location.clone()); }
}

export class MoveCommand {
    constructor(public entity: Entity,
                public location: Location) {}
    public toString(): string {return `MoveCommand(${this.entity.toString()}, ${this.location.toString()})`; }
    public clone(): MoveCommand {return new MoveCommand(this.entity.clone(), this.location.clone()); }
}

export class Clarification {
    constructor(public entity: Entity) {}
    public toString(): string {return `Clarification(${this.entity.toString()})`; }
    public clone(): Clarification {return new Clarification(this.entity.clone()); }
}

/*
// Here's an example of a class definition for a new command
// Don't forget to add it to the type definition of 'Command' above
// The corresponding grammar rule(s) must also be added to Grammar.ne
export class WhereisCommand {
    constructor(public entity : Entity) {}
    toString() : string {return `WhereisCommand(${this.entity.toString()})`};
    clone() : WhereisCommand {return new WhereisCommand(this.entity.clone())};
}
*/

export class Location {
    constructor(public relation: Relation,
                public entity: Entity) {}
    public toString(): string {return `Location(${this.relation}, ${this.entity.toString()})`; }
    public clone(): Location {return new Location(this.relation, this.entity.clone()); }
}

export class Entity {
    constructor(public quantifier: string,
                public object: Object) {}
    public toString(): string {return `Entity(${this.quantifier}, ${this.object.toString()})`; }
    public clone(): Entity {return new Entity(this.quantifier, this.object.clone()); }
}

export type Object = RelativeObject | SimpleObject;

export class RelativeObject {
    constructor(public object: Object,
                public location: Location) {}
    public toString(): string {return `RelativeObject(${this.object.toString()}, ${this.location.toString()})`; }
    public clone(): RelativeObject {return new RelativeObject(this.object.clone(), this.location.clone()); }
}

export class SimpleObject {
    constructor(public form: Form,
                public size: Size | null,
                public color: Color | null) {}
    public toString(): string {return `SimpleObject(${this.form}, ${this.size}, ${this.color})`; }
    public clone(): SimpleObject {return new SimpleObject(this.form, this.size, this.color); }
}

export type Size = "small" | "large";
export type Color = "red" | "black" | "blue" | "green" | "yellow" | "white";
export type Form = "anyform" | "brick" | "plank" | "ball" | "pyramid" | "box" | "table" | "floor";
export type Relation = "leftof" | "rightof" | "inside" | "ontop" | "under" | "beside" | "above" | "holding"
    | "at any location";
//////////////////////////////////////////////////////////////////////
// Interpretations

export class DNFFormula {
    public static parse(input: string): DNFFormula {
        return new DNFFormula(input.split("|").map((conjunction) => Conjunction.parse(conjunction.trim())));
    }
    constructor(public conjuncts: Conjunction[] = []) {}
    public toString(): string {return this.conjuncts.map((conj) => conj.toString()).join(" | "); }
}

export class Conjunction {
    public static parse(input: string): Conjunction {
        return new Conjunction(input.split("&").map((literal) => Literal.parse(literal.trim())));
    }
    constructor(public literals: Literal[] = []) {}
    public toString(): string {return this.literals.map((lit) => lit.toString()).join(" & "); }
}

// A Literal represents a relation that is intended to hold among some objects.
export class Literal {
    public static parse(input: string): Literal {
        const relargs = input.split("(");
        return new Literal(relargs[0] as Relation, relargs[1].slice(0, -1).split(","));
    }
    constructor(
        public relation: Relation,         // The name of the relation in question
        public args: string[],           // The arguments to the relation
        public polarity: boolean = true, // Whether the literal is positive (true) or negative (false)
    ) {}
    public toString(): string {return (this.polarity ? "" : "-") + this.relation + "(" + this.args.join(",") + ")"; }
}
