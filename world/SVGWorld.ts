import * as $ from "jquery";
import {World, WorldState} from "./World";

/*
 * SVGWorld
 *
 * This is the implementation of the World interface, for the browser version.
 * It is used by 'shrdlite-html.ts'.
 *
 * You don't have to edit this file, but you might want to play around with
 * the public constants defined below.
 */

export class SVGWorld implements World {
    //////////////////////////////////////////////////////////////////////
    // Public constants that can be played around with
    public dialogueHistory = 100;    // max nr. utterances
    public floorThickness = 10;     // pixels
    public wallSeparation = 4;     // pixels
    public armSize = 0.2;         // of stack width
    public animationPause = 0.01; // seconds
    public promptPause = 0.5;   // seconds
    public ajaxTimeout = 5;    // seconds
    public armSpeed = 1000;   // pixels per second

    // There is no way of setting male/female voice,
    // so this is one way of having different voices for user/system:
    public voices: {[participant: string]: {lang: string, rate: number}} = {
        system: {lang: "en-GB", rate: 1.1}, // British English, slightly faster
        user: {lang: "en-US", rate: 1.0},  // American English
    };

    // HTML id's for different containers
    public containers = {
        world: $("#theworld"),
        dialogue: $("#dialogue"),
        inputform: $("#dialogue form"),
        userinput: $("#dialogue form input:text"),
        inputexamples: $("#dialogue form select"),
    };

    //////////////////////////////////////////////////////////////////////
    // Private variables & constants
    private canvasWidth: number;
    private canvasHeight: number;
    private svgNS = "http://www.w3.org/2000/svg";

    //////////////////////////////////////////////////////////////////////
    // Object types
    private objectData: {[form: string]:
            {[size: string]:
                    {width: number, height: number, thickness?: number}}}
        = {brick: {small: {width: 0.30, height: 0.30},
            large: {width: 0.70, height: 0.60}},
        plank: {small: {width: 0.60, height: 0.10},
            large: {width: 1.00, height: 0.15}},
        ball: {small: {width: 0.30, height: 0.30},
            large: {width: 0.70, height: 0.70}},
        pyramid: {small: {width: 0.60, height: 0.25},
            large: {width: 1.00, height: 0.40}},
        box: {small: {width: 0.60, height: 0.30, thickness: 0.10},
            large: {width: 1.00, height: 0.40, thickness: 0.10}},
        table: {small: {width: 0.60, height: 0.30, thickness: 0.10},
            large: {width: 1.00, height: 0.40, thickness: 0.10}},
    };

    private inputCallback: (input: string) => void = () => { /* Empty */};

    constructor(
        public currentState: WorldState,
        public useSpeech = false
    ) {
        if (!this.currentState.arm) { this.currentState.arm = 0; }
        this.canvasWidth = this.containers.world.width()! - 2 * this.wallSeparation;
        this.canvasHeight = this.containers.world.height()! - this.floorThickness;

        const dropdown: JQuery = this.containers.inputexamples;
        dropdown.empty();
        dropdown.append($('<option value="">').text("(Select an example utterance)"));
        $.each(this.currentState.examples, function(i, value) {
            dropdown.append($("<option>").text(value));
        });

        dropdown.change(() => {
            const userinput = (dropdown.val() as string).trim();
            if (userinput) {
                this.containers.userinput.val(userinput).focus();
            }
        });
        this.containers.inputform.submit(() => this.handleUserInput.call(this));
        this.disableInput();
    }

    //////////////////////////////////////////////////////////////////////
    // Public methods

    public readUserInput(prompt: string, callback: (input: string) => void) {
        this.printSystemOutput(prompt);
        this.enableInput();
        this.inputCallback = callback;
    }

    public printSystemOutput(output: string, participant= "system", utterance?: string) {
        if (utterance === undefined) {
            utterance = output;
        }
        const dialogue = this.containers.dialogue;
        if (dialogue.children().length > this.dialogueHistory) {
            dialogue.children().first().remove();
        }
        $("<p>").attr("class", participant)
            .text(output)
            .insertBefore(this.containers.inputform);
        dialogue.scrollTop(dialogue.prop("scrollHeight"));

        if (this.useSpeech && utterance && /^\w/.test(utterance)) {
            try {
                // W3C Speech API (works in Chrome and Safari)
                const speech = new SpeechSynthesisUtterance(utterance);
                speech.lang = this.voices[participant].lang;
                speech.rate = this.voices[participant].rate;
                console.log("SPEAKING: " + utterance);
                window.speechSynthesis.speak(speech);
            } catch (err) {
                // Ignored
            }
        }
    }

    public printDebugInfo(info: string): void {
        console.log(info);
    }

    public printError(error: string, message?: string): void {
        console.error(error, message);
        if (message) {
            error += ": " + message;
        }
        this.printSystemOutput(error, "error");
    }

    public printWorld(callback?: () => void): void {
        this.containers.world.empty();
        this.printSystemOutput("Please wait while I populate the world.");

        const viewBox: number[] = [0, 0, this.canvasWidth + 2 * this.wallSeparation,
                                  this.canvasHeight + this.floorThickness];
        const svg = $(this.SVG("svg")).attr({
            viewBox: viewBox.join(" "),
            width: viewBox[2],
            height: viewBox[3],
        }).appendTo(this.containers.world);

        // The floor:
        $(this.SVG("rect")).attr({
            x: 0,
            y: this.canvasHeight,
            width: this.canvasWidth + 2 * this.wallSeparation,
            height: this.canvasHeight + this.floorThickness,
            fill: "black",
        }).appendTo(svg);

        // The arm:
        $(this.SVG("line")).attr({
            "id": "arm",
            "x1": this.stackWidth() * this.currentState.arm + this.stackWidth() / 2,
            "y1": this.armSize * this.stackWidth() - this.canvasHeight,
            "x2": this.stackWidth() * this.currentState.arm + this.stackWidth() / 2,
            "y2": this.armSize * this.stackWidth(),
            "stroke": "black",
            "stroke-width": this.armSize * this.stackWidth(),
        }).appendTo(svg);

        // If the arm is holding an object:
        if (this.currentState.holding) {
            this.makeObject(svg, this.currentState.holding, this.currentState.arm, 0);
        }

        // The objects on the floor:
        let timeout = 0;
        for (let stacknr = 0; stacknr < this.currentState.stacks.length; stacknr++) {
            for (const objectid of this.currentState.stacks[stacknr]) {
                this.makeObject(svg, objectid, stacknr, timeout);
                timeout += this.animationPause;
            }
        }

        if (callback) {
            setTimeout(callback, (timeout + this.promptPause) * 1000);
        }
    }

    public performPlan(plan: string[], callback?: () => void): void {
        if (this.isSpeaking()) {
            setTimeout(() => this.performPlan(plan, callback), this.animationPause * 1000);
            return;
        }
        let planctr = 0;
        const performNextAction = () => {
            planctr++;
            if (plan && plan.length) {
                const item = (plan.shift() as string) .trim();
                const action = this.getAction(item);
                if (action) {
                    try {
                        action.call(this, performNextAction);
                    } catch (err) {
                        this.printError(err);
                        if (callback) { setTimeout(callback, this.promptPause * 1000); }
                    }
                } else {
                    if (item && item[0] !== "#") {
                        if (this.isSpeaking()) {
                            plan.unshift(item);
                            setTimeout(performNextAction, this.animationPause * 1000);
                        } else {
                            this.printSystemOutput(item);
                            performNextAction();
                        }
                    } else {
                        performNextAction();
                    }
                }
            } else {
                if (callback) { setTimeout(callback, this.promptPause * 1000); }
            }
        };
        performNextAction();
    }

    private stackWidth(): number {
        return this.canvasWidth / this.currentState.stacks.length;
    }

    private boxSpacing(): number {
        return Math.min(5, this.stackWidth() / 20);
    }

    private SVG(tag: string): Element {
        return document.createElementNS(this.svgNS, tag);
    }

    private animateMotion(object: JQuery, path: Array<string|number>, timeout: number, duration: number) {
        const animation: Element = this.SVG("animateMotion");
        $(animation).attr({
            begin: "indefinite",
            fill: "freeze",
            path: path.join(" "),
            dur: duration + "s",
        }).appendTo(object);
        animation.beginElementAt(timeout);
        return animation;
    }

    //////////////////////////////////////////////////////////////////////
    // The basic actions: left, right, pick, drop

    private getAction(act: string): (callback: () => void) => void {
        const actions: {[act: string]: (callback: () => void) => void}
            = {p: this.pick, d: this.drop, l: this.left, r: this.right};
        return actions[act.toLowerCase()];
    }

    private left(callback: () => void): void {
        if (this.currentState.arm <= 0) {
            throw new Error("Already at left edge!");
        }
        this.horizontalMove(this.currentState.arm - 1, callback);
    }

    private right(callback: () => void): void {
        if (this.currentState.arm >= this.currentState.stacks.length - 1) {
            throw new Error("Already at right edge!");
        }
        this.horizontalMove(this.currentState.arm + 1, callback);
    }

    private drop(callback: () => void): void {
        if (!this.currentState.holding) {
            throw new Error("Not holding anything!");
        }
        this.verticalMove("drop", callback);
        this.currentState.stacks[this.currentState.arm].push(this.currentState.holding);
        this.currentState.holding = null;
    }

    private pick(callback: () => void): void {
        if (this.currentState.holding) {
            throw new Error("Already holding something!");
        }
        this.currentState.holding = this.currentState.stacks[this.currentState.arm].pop() as string;
        this.verticalMove("pick", callback);
    }

    //////////////////////////////////////////////////////////////////////
    // Moving around

    private horizontalMove(newArm: number, callback?: () => void): void {
        const xArm = this.currentState.arm * this.stackWidth() + this.wallSeparation;
        const xNewArm = newArm * this.stackWidth() + this.wallSeparation;
        const path1 = ["M", xArm, 0, "H", xNewArm];
        const duration = Math.abs(xNewArm - xArm) / this.armSpeed;
        const arm = $("#arm");
        this.animateMotion(arm, path1, 0, duration);
        if (this.currentState.holding) {
            const objectHeight = this.getObjectDimensions(this.currentState.holding).heightadd;
            const yArm = -(this.canvasHeight - this.armSize * this.stackWidth() - objectHeight);
            const path2 = ["M", xArm, yArm, "H", xNewArm];
            const object = $("#" + this.currentState.holding);
            this.animateMotion(object, path2, 0, duration);
        }
        this.currentState.arm = newArm;
        if (callback) { setTimeout(callback, (duration + this.animationPause) * 1000); }
    }

    private verticalMove(action: string, callback?: () => void): void {
        const altitude = this.getAltitude(this.currentState.arm);
        let yArm = this.canvasHeight - altitude - this.armSize * this.stackWidth();
        if (this.currentState.holding) {
            yArm -= this.getObjectDimensions(this.currentState.holding).heightadd;
        }
        const yStack = -altitude;
        const xArm = this.currentState.arm * this.stackWidth() + this.wallSeparation;

        const path1 = ["M", xArm, 0, "V", yArm];
        const path2 = ["M", xArm, yArm, "V", 0];
        const duration = (Math.abs(yArm)) / this.armSpeed;
        const arm = $("#arm");
        const object = $("#" + this.currentState.holding);

        this.animateMotion(arm, path1, 0, duration);
        this.animateMotion(arm, path2, duration + this.animationPause, duration);
        if (action === "pick") {
            const path3 = ["M", xArm, yStack, "V", yStack - yArm];
            this.animateMotion(object, path3, duration + this.animationPause, duration);
        } else {
            const path3 = ["M", xArm, yStack - yArm, "V", yStack];
            this.animateMotion(object, path3, 0, duration);
        }
        if (callback) { setTimeout(callback, 2 * (duration + this.animationPause) * 1000); }
    }

    //////////////////////////////////////////////////////////////////////
    // Methods for getting information about objects

    private getObjectDimensions(objectid: string) {
        const attrs = this.currentState.objects[objectid];
        const size = this.objectData[attrs.form][attrs.size as string];
        const width = size.width * (this.stackWidth() - this.boxSpacing());
        const height = size.height * (this.stackWidth() - this.boxSpacing());
        const thickness = (size.thickness || 0) * (this.stackWidth() - this.boxSpacing());
        const heightadd = attrs.form === "box" ? thickness : height;
        return {
            width,
            height,
            heightadd,
            thickness,
        };
    }

    private getAltitude(stacknr: number, objectid?: string) {
        const stack = this.currentState.stacks[stacknr];
        let altitude = 0;
        for (const stackItem of stack) {
            if (objectid === stackItem) {
                break;
            }
            altitude += this.getObjectDimensions(stackItem).heightadd + this.boxSpacing();
        }
        return altitude;
    }

    //////////////////////////////////////////////////////////////////////
    // Creating objects

    private makeObject(svg: JQuery, objectid: string, stacknr: number, timeout: number) {
        const attrs = this.currentState.objects[objectid];
        const dim = this.getObjectDimensions(objectid);

        let altitude: number;
        if (objectid === this.currentState.holding) {
            altitude = this.canvasHeight - this.armSize * this.stackWidth() - dim.heightadd;
        } else {
            altitude = this.getAltitude(stacknr, objectid);
        }

        const ybottom = this.canvasHeight - this.boxSpacing();
        const ytop = ybottom - dim.height;
        const ycenter = (ybottom + ytop) / 2;
        const yradius = (ybottom - ytop) / 2;
        const xleft = (this.stackWidth() - dim.width) / 2;
        const xright = xleft + dim.width;
        const xcenter = (xright + xleft) / 2;
        const xradius = (xright - xleft) / 2;
        const xmidleft = (xcenter + xleft) / 2;
        const xmidright = (xcenter + xright) / 2;

        let object: JQuery;
        switch (attrs.form) {
        case "brick":
        case "plank":
            object = $(this.SVG("rect")).attr({
                x: xleft,
                y: ytop,
                width: dim.width,
                height: dim.height
            });
            break;
        case "ball":
            object = $(this.SVG("ellipse")).attr({
                cx: xcenter,
                cy: ycenter,
                rx: xradius,
                ry: yradius
            });
            break;
        case "pyramid":
            const pyrPoints = [xleft, ybottom, xmidleft, ytop, xmidright, ytop, xright, ybottom];
            object = $(this.SVG("polygon")).attr({
                points: pyrPoints.join(" ")
            });
            break;
        case "box":
            const boxPoints = [xleft, ytop, xleft, ybottom, xright, ybottom, xright, ytop,
                          xright - dim.thickness, ytop, xright - dim.thickness, ybottom - dim.thickness,
                          xleft + dim.thickness, ybottom - dim.thickness, xleft + dim.thickness, ytop];
            object = $(this.SVG("polygon")).attr({
                points: boxPoints.join(" ")
            });
            break;
        case "table":
            const tabPoints = [xleft, ytop, xright, ytop, xright, ytop + dim.thickness,
                          xmidright, ytop + dim.thickness, xmidright, ybottom,
                          xmidright - dim.thickness, ybottom, xmidright - dim.thickness, ytop + dim.thickness,
                          xmidleft + dim.thickness, ytop + dim.thickness, xmidleft + dim.thickness, ybottom,
                          xmidleft, ybottom, xmidleft, ytop + dim.thickness, xleft, ytop + dim.thickness];
            object = $(this.SVG("polygon")).attr({
                points: tabPoints.join(" ")
            });
            break;
        default:
            throw new Error("Unknown form: " + attrs.form);
        }
        object.attr({
            "id": objectid,
            "stroke": "black",
            "stroke-width": this.boxSpacing() / 2,
            "fill": attrs.color,
        });
        object.appendTo(svg);

        const path = ["M", stacknr * this.stackWidth() + this.wallSeparation,
            -(this.canvasHeight + this.floorThickness)];
        this.animateMotion(object, path, 0, 0);
        path.push("V", -altitude);
        this.animateMotion(object, path, timeout, 0.5);
    }

    //////////////////////////////////////////////////////////////////////
    // Methods for handling user input and system output

    private enableInput() {
        this.containers.inputexamples.prop("disabled", false).val("");
        this.containers.inputexamples.find("option:first").attr("selected", "selected");
        this.containers.userinput.prop("disabled", false);
        this.containers.userinput.focus().select();
    }

    private disableInput() {
        this.containers.inputexamples.blur();
        this.containers.inputexamples.prop("disabled", true);
        this.containers.userinput.blur();
        this.containers.userinput.prop("disabled", true);
    }

    private handleUserInput() {
        const userinput = (this.containers.userinput.val() as string).trim();
        this.disableInput();
        this.printSystemOutput(userinput, "user");
        this.inputCallback(userinput);
        return false;
    }

    private isSpeaking() {
        return this.useSpeech && window && window.speechSynthesis && window.speechSynthesis.speaking;
    }

}

//////////////////////////////////////////////////////////////////////
// Additions to the TypeScript standard library

// Support for SVG animations

declare global {
    interface Element {
        beginElementAt(timeout: number): void;
    }
}
