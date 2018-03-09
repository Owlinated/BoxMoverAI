# Heuristic
Find heuristic for each literal. Then find the maximum for each conjunction.
Finally use the minimum of all conjunctions as the heuristic.

This part might be optimizable with tree search/alpha beta pruning

## Literal Heuristic
Test if literal is full filled: return 0
Otherwise add number of items on top of object A to heuristic.
If relation is either inside, ontop, under, or above add number of items on top of object B to heuristic.
Return heuristic

## Extension
A more detailed heuristic, might include the cost of moving the arm, reward picking up objects, etc.