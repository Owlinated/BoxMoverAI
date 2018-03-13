import * as $ from "jquery";
import {ExampleWorlds} from "../world/ExampleWorlds";
import {SVGWorld} from "../world/SVGWorld";
import {World} from "../world/World";
import {parseUtteranceIntoPlan, splitStringIntoPlan} from "./Shrdlite";

/*
 * shrdlite-html
 *
 * This is the main file for the browser-based version.
 * You don't have to edit this file.
 */

const defaultWorld = "small";
const defaultSpeech = true;

$(() => {
    let current: string = getURLParameter("world");
    if (!(current in ExampleWorlds)) {
        current = defaultWorld;
    }
    const speech: string = (getURLParameter("speech") || "").toLowerCase();
    const useSpeech: boolean = (speech === "true" || speech === "1" || defaultSpeech);

    $("#currentworld").text(current);
    $("<a>").text("reset")
        .attr("href", "?world=" + current + "&speech=" + useSpeech)
        .appendTo($("#resetworld"));
    $("#otherworlds").empty();
    for (const wname in ExampleWorlds) {
        if (wname !== current) {
            $("<a>").text(wname)
                .attr("href", "?world=" + wname + "&speech=" + useSpeech)
                .appendTo($("#otherworlds"))
                .after(" ");
        }
    }
    $("<a>").text(useSpeech ? "turn off" : "turn on")
        .attr("href", "?world=" + current + "&speech=" + (!useSpeech))
        .appendTo($("#togglespeech"));

    const world = new SVGWorld(ExampleWorlds[current], useSpeech);
    interactiveLoop(world);
});

/**
 * The interaction loop.
 * It calls 'splitStringIntoPlan()' and 'parseUtteranceIntoPlan()' after each utterance.
 * @param {World} world
 */
function interactiveLoop(world: World): void {
    function endlessLoop(utterance: string = ""): void {
        const inputPrompt = "What can I do for you today? ";
        const nextInput = () => world.readUserInput(inputPrompt, endlessLoop);
        if (utterance.trim()) {
            let theplan: string[] | null | string = splitStringIntoPlan(utterance);
            if (!theplan) {
                // Need clarification, outputs question
                theplan = parseUtteranceIntoPlan(world, utterance);
                if (typeof theplan === "string") {
                    world.readUserInput(theplan, endlessLoop);
                    return;
                }
            }
            if (theplan) {
                world.printDebugInfo("Plan: " + theplan.join(", "));
                world.performPlan(theplan, nextInput);
                return;
            }
        }
        nextInput();
    }
    world.printWorld(endlessLoop);
}

/**
 * This function will ask for confirmation if the user tries to close the window.
 * Adapted from: http://www.openjs.com/scripts/events/exit_confirmation.php
 * @param event
 */
function goodbye(event: any) {
    // Note: the type of 'event' is really 'Event', but its interface says that
    // 'event.returnValue' is a boolean, which is not the case, so we set the type to 'any'
    if (!event) { event = window.event; }
    // event.cancelBubble is supported by IE - this will kill the bubbling process.
    event.cancelBubble = true;
    // This is displayed in the dialog:
    event.returnValue = "Are you certain?\nYou cannot undo this, you know.";
    // event.stopPropagation works in Firefox.
    if (event.stopPropagation) {
        event.stopPropagation();
        event.preventDefault();
    }
}
// window.onbeforeunload = goodbye;

/**
 * This function gets the URL parameter value for a given key all parameters in the URL string,
 * i.e., if the URL is "http://..../....?x=3&y=42", then getURLParameter("y") == 42
 * Adapted from: http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
 * @param {string} sParam
 * @returns {string}
 */
function getURLParameter(sParam: string): string {
    const sPageURL = window.location.search.slice(1);
    const sURLVariables = sPageURL.split("&");
    for (const sURLVariable of sURLVariables) {
        const sParameterName = sURLVariable.split("=");
        if (sParameterName[0] === sParam) {
            return sParameterName[1];
        }
    }
    return "";
}​
