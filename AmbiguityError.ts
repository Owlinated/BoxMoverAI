export class AmbiguityError extends Error {
    constructor(m: string) {
        super(m);
        Object.setPrototypeOf(this, AmbiguityError.prototype);
    }
}