import {ListObjects} from "../core/Describer";
import {GetSimple} from "../core/Helper";
import {
    Clarification,
    DropCommand,
    Entity,
    Location,
    MoveCommand,
    Object,
    RelativeObject,
    ShrdliteResult,
    SimpleObject,
    TakeCommand,
} from "../core/Types";
import {AmbiguityError} from "./AmbiguityError";

/**
 * Consumes possible interpretations and applies clarifications to resolve ambiguities.
 * May ask for more clarifications by throwing an error.
 * @param  possibleParses The different parses to choose from.
 * @param  clarifications The clarifications of the parses.
 * @return                Returns the only possible parse.
 */
export function resolveParseAmbiguities(possibleParses: ShrdliteResult[],
                                        clarifications: Clarification[][]): ShrdliteResult {
    let ambiguousObjects: Array<{ parse: ShrdliteResult, entity: Entity }> = [];
    for (const parse of possibleParses) {
        if (parse.parse instanceof MoveCommand) {
            ambiguousObjects.push({parse, entity: parse.parse.entity});
        } else if (parse.parse instanceof TakeCommand) {
            ambiguousObjects.push({parse, entity: parse.parse.entity});
        } else if (parse.parse instanceof DropCommand) {
            // Describe the object being held in terms of an entity
            ambiguousObjects.push({
                entity:
                    new Entity("the",
                        new RelativeObject(
                            new SimpleObject("anyform", null, null),
                            new Location("holding",
                                new Entity("the",
                                    new SimpleObject("anyform", null, null))))),
                parse,
            });
        } else {
            throw Error(`Unexpected ambiguity in ${parse}`);
        }
    }

    while (ambiguousObjects.length > 1 && clarifications.length > 0) {
        const clarification = clarifications.splice(0, 1)[0];
        ambiguousObjects = ambiguousObjects.filter((object) =>
            clarification.some((clar) =>
                isObjectMatch((clar as Clarification).entity.object, object.entity.object)));
    }

    if (ambiguousObjects.length === 0) {
        throw new Error("No interpretation matches your clarifications.");
    }

    if (ambiguousObjects.length <= 1) {
        return ambiguousObjects[0].parse;
    }

    const objectsDescription = ListObjects(ambiguousObjects.map((parse) => parse.entity.object));
    throw new AmbiguityError(`Do you want me to move ${objectsDescription}?`);
}

/**
 * Makes sure that entity has all properties of filter.
 * @param filter: The entity we are using to filter.
 * @param entity: The entity we are testing.
 * @returns: False if entity has properties different from filter.
 */
function isEntityMatch(filter: Entity, entity: Entity): boolean {
    if (entity.quantifier !== filter.quantifier) {
        return false;
    }
    return isObjectMatch(filter.object, entity.object);
}

/**
 * Makes sure that object has all the properties of filter.
 *
 * @param filter: The object we are using to filter.
 * @param object: The object we want to test.
 * @returns: False if object has properties different from filter.
 */
function isObjectMatch(filter: Object, object: Object): boolean {
    if (filter instanceof SimpleObject) {
        object = GetSimple(object);
        if (filter.form !== "anyform" && object.form !== filter.form) {
            return false;
        }
        if (filter.color !== null && object.color !== filter.color) {
            return false;
        }
        if (filter.size !== null && object.size !== filter.size) {
            return false;
        }
        return true;
    } else {
        if (filter.location.relation === "at any location") {
            if (object instanceof RelativeObject) {
                return false;
            }
            return isObjectMatch(filter.object, object);
        }
        if (object instanceof SimpleObject) {
            return false;
        }
        return isLocationMatch(filter.location, object.location) && isObjectMatch(filter.object, object.object);
    }
}

 /**
  * Makes sure that location has all the properties of filter
  *
  * @param filter: The entity we are using to filter
  * @param location: The entity we want to test.
  * @returns: False if location has properties different from filter.
  */
function isLocationMatch(filter: Location, location: Location): boolean {
    if (location.relation !== filter.relation) {
        return false;
    }
    return isEntityMatch(filter.entity, location.entity);
}
