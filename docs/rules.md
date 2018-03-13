# Rules
The different rules of our simulation need to be validated at different points.
Below is a list of all rules grouped by the module asserting them.

## World validation function
 - All objects must be supported by something.

## Interpreter rules:
 - ??? The arm can only hold one object at the time. (Should place the current object down?)
 - ??? The arm can only pick up free objects. (Should place the current object down?)
 - Objects are “inside” boxes, but “ontop” of other objects.

## Planner rules:
 - The arm can only hold one object at the time.
 - The arm can only pick up free objects.
 - The floor can support at most N objects (beside each other).

## Validate everywhere
 - Balls must be in boxes or on the floor, otherwise they roll away.
 - Balls cannot support anything.
 - Small objects cannot support large objects.
 - Boxes cannot contain pyramids, planks or boxes of the same size.
 - Small boxes cannot be supported by small bricks or pyramids.
 - Large boxes cannot be supported by large pyramids.