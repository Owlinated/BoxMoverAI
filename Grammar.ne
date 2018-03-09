
## This is a grammar for Shrdlite, written for the Nearley Javascript chartparser
## To compile into a TypeScript file:  nearleyc Grammar.ne > Grammar.ts
## More information about Nearley:  https://github.com/Hardmath123/nearley

## Note that for simplicity this grammar does not recognise uppcase, whitespace or punctuation.
## This means that it has to be called with a contracted lowercase string, i.e.,
## the string "Take the blue ball!" is not recognised, but instead "taketheblueball"

@preprocessor typescript

@{%
import {
    Command, TakeCommand, DropCommand, MoveCommand,
    Clarification,
    Location, Entity,
    Object, RelativeObject, SimpleObject,
} from "./Types";
%}

## Grammar rules

main --> will_you:? please:? command please:?  {% (d) => d[2] %}
main --> will_you_use:? entityClarification please:? {% (d) => new Clarification(d[1]) %}

command --> take entity           {% (d) => new TakeCommand(d[1]) %}
command --> move  it    location  {% (d) => new DropCommand(d[2]) %}
command --> move entity location  {% (d) => new MoveCommand(d[1], d[2]) %}

## Here's an example of a new command
## Don't forget to add it in the import above, and uncomment the 'where_is' grammar rule below
## The corresponding class (WhereisCommand) must also be added to Types.ts
# command --> where_is entity       {% (d) => new WhereisCommand(d[1]) %}

location --> relation entity  {% (d) => new Location(d[0], d[1]) %}
location --> "at" "any" "location" {% (d) => new Location("at any location", new Entity("the", new SimpleObject("floor", null, null))) %}
location --> "being" "held" {% (d) => new Location("holding", new Entity("the", new SimpleObject("floor", null, null))) %}

entity --> quantifierSG objectSG  {% (d) => new Entity(d[0], d[1]) %}
entity --> quantifierPL objectPL  {% (d) => new Entity(d[0], d[1]) %}
entity --> "the" "floor"          {% (d) => new Entity("the", new SimpleObject("floor", null, null)) %}
entityClarification --> entity    {% (d) => d[0] %}

objectSG --> objectSG that_is:?  location  {% (d) => new RelativeObject(d[0], d[2]) %}
objectPL --> objectPL that_are:? location  {% (d) => new RelativeObject(d[0], d[2]) %}

objectSG --> size:? color:? formSG  {% (d) => new SimpleObject(d[2], d[0], d[1]) %}
objectPL --> size:? color:? formPL  {% (d) => new SimpleObject(d[2], d[0], d[1]) %}

## Lexical rules

quantifierSG --> ("any" | "an" | "a")  {% (d) => "any" %}
quantifierSG --> ("the")               {% (d) => "the" %}
quantifierSG --> ("every")             {% (d) => "all" %}
quantifierPL --> ("all")               {% (d) => "all" %}

relation --> ("left"  "of" | "to" "the" "left"  "of")  {% (d) => "leftof" %}
relation --> ("right" "of" | "to" "the" "right" "of")  {% (d) => "rightof" %}
relation --> ("inside" | "in" | "into")  {% (d) => "inside" %}
relation --> ("to" | "on" | "on" "top" "of")    {% (d) => "ontop" %}
relation --> ("under" | "below")         {% (d) => "under" %}
relation --> ("beside" | "next" "to")    {% (d) => "beside" %}
relation --> ("above")                   {% (d) => "above" %}

size --> ("small" | "tiny")  {% (d) => "small" %}
size --> ("large" | "big")   {% (d) => "large" %}

color --> "black"   {% (d) => "black" %}
color --> "white"   {% (d) => "white" %}
color --> "blue"    {% (d) => "blue" %}
color --> "green"   {% (d) => "green" %}
color --> "yellow"  {% (d) => "yellow" %}
color --> "red"     {% (d) => "red" %}

formSG --> form      {% (d) => d[0] %}
formPL --> form "s"  {% (d) => d[0] %}

formSG --> "box"    {% (d) => "box" %}
formPL --> "boxes"  {% (d) => "box" %}

form --> ("object" | "thing" | "form" | "one")  {% (d) => "anyform" %}
form --> "brick"    {% (d) => "brick" %}
form --> "plank"    {% (d) => "plank" %}
form --> "ball"     {% (d) => "ball" %}
form --> "pyramid"  {% (d) => "pyramid" %}
form --> "table"    {% (d) => "table" %}


## Lexicon (without semantic content)

take --> "take" | "grasp" | "pick" "up"
move --> "move" | "put" | "drop"
it --> "it"

that_is  --> "that" "is"
that_are --> "that" "are"

will_you --> ("will" | "can" | "could") "you"
will_you --> "please"
will_you_use --> will_you "use"

please --> "please"

## Here's an example of a new grammar rule, which can be used in the WhereisCommand above
# where_is --> "where" "is"
