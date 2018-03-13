export class AmbiguityError extends Error {
    constructor(m: string) {
        super(m);
        (Object as any).setPrototypeOf(this, AmbiguityError.prototype);
    }
}
