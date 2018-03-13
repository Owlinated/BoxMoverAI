import {Object, RelativeObject, SimpleObject} from "./Types";

export function GroupBy<T>(values: T[], key: (value: T) => any) {
    return values.reduce((accumulation, next) => {
        ((accumulation as any)[key(next)] = (accumulation as any)[key(next)] || []).push(next);
        return accumulation;
    }, {});
}

export function GetSimple(object: Object): SimpleObject {
    let obj = object;
    while (obj instanceof RelativeObject) {
        obj = obj.object;
    }
    return obj;
}
