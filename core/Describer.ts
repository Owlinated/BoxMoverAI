import {AmbiguityError} from "../interpreter/AmbiguityError";
import {GetSimple, GroupBy} from "./Helper";
import {Entity, Location, Object, RelativeObject, SimpleObject} from "./Types";
import {WorldState} from "../world/World";
import {NodeLowLevel} from "../planner/PlannerLowLevel";

export function ListObjects(objects: Object[]): string {
    if (objects.length === 0) {
        throw new Error("Objects cannot be empty");
    }
    const grouped = GroupBy(objects, (object: Object) => GetSimple(object).form);
    const keys = Object.keys(grouped);
    const terms = keys.map((key) => `${ListObjectsByColor((grouped as any)[key], key === "anyform" ? "object" : key)}`);
    const result = StringOrJoin(terms);

    if (keys.length === 1 && result === "the " + keys[0]) {
        throw new AmbiguityError(`Found similar objects. Please describe your ${keys[0]}.`);
    }
    return result;
}

function ListObjectsByColor(objects: Object[], description: string): string {
    if (objects.length === 0) {
        throw new Error("Objects cannot be empty");
    }
    const grouped = GroupBy(objects, (object: Object) => GetSimple(object).color);
    const keys = Object.keys(grouped);
    if (keys.length === 1) {
        return ListObjectsBySize((grouped as any)[keys[0]], description);
    }
    const terms = keys.map((key) =>
        ListObjectsBySize((grouped as any)[key],
            `${key === "undefined" ? "any color" : key} ${description}`));
    return ` ${StringOrJoin(terms)}`;
}

function ListObjectsBySize(objects: Object[], description: string): string {
    if (objects.length === 0) {
        throw new Error("Objects cannot be empty");
    }
    const grouped = GroupBy(objects, (object: Object) => GetSimple(object).size);
    const keys = Object.keys(grouped);
    if (keys.length === 1) {
        return `the ${ListObjectsByLocation((grouped as any)[keys[0]], description)}`;
    }
    const terms = keys.map((key) =>
        ListObjectsByLocation((grouped as any)[key], key === "undefined" ? "any size" : key));
    return ` the ${StringOrJoin(terms)} ${description}`;
}

function ListObjectsByLocation(objects: Object[], description: string): string {
    if (objects.length === 0) {
        throw new Error("Objects cannot be empty");
    }
    const grouped = GroupBy(
        objects,
        (object) => object instanceof RelativeObject ? DescribeLocation(object.location) : undefined);
    const keys = Object.keys(grouped);
    if (keys.length === 1) {
        return description;
    }

    const terms = keys.map((key) => key === "undefined" ? "at any location" : key);
    return `${description} ${terms.join(" or the one ")}`;
}

function DescribeLocation(location: Location): string {
    if (location.relation === "at any location") {
        return location.relation;
    }
    if (location.relation === "holding") {
        return "being held";
    }
    return `that is ${location.relation} ${DescribeEntity(location.entity)}`;
}

function DescribeEntity(entity: Entity): string {
    return `${entity.quantifier} ${DescribeObject(entity.object)}`;
}

export function DescribeObjectState(object: string, state: NodeLowLevel): string {
    const simpleObject = state.world.objects[object];
    return DescribeSimpleObject(simpleObject);
}

export function DescribeObject(object: Object): string {
    const locations: Location[] = [];
    let relativeObject = object;
    while (relativeObject instanceof RelativeObject) {
        locations.push(relativeObject.location);
        relativeObject = relativeObject.object;
    }
    return `${DescribeSimpleObject(relativeObject)} ${locations.map(DescribeLocation).join(" ")}`;
}

function DescribeSimpleObject(object: SimpleObject): string {
    return (object.size === null ? "" : object.size + " ")
        + (object.color === null ? "" : object.color + " ")
        + (object.form === "anyform" ? "object" : object.form);
}

function StringOrJoin(strings: string[]): string {
    if (strings.length === 1) {
        return strings[0];
    }
    let last = strings.splice(-1, 1)[0];
    last = (strings.length > 1 ? ", or " : " or ") + last;
    return strings.join(", ") + last;
}

