import {Graph, SearchResult, Successor} from "./Graph";
import PriorityQueue from "./lib/typescript-collections/src/lib/PriorityQueue";
import Set from "./lib/typescript-collections/src/lib/Set";

/*
 * AStarSearch
 *
 * This module contains an implementation of the A* algorithm.
 */

/**
 * A* search implementation, parameterised by a 'Node' type.
 * @param graph: The graph on which to perform A* search.
 * @param start: The initial node.
 * @param goal: A function that returns true when given a goal node.
 *              Used to determine if the algorithm has reached the goal.
 * @param heuristics: The heuristic function.
 *                    Used to estimate the cost of reaching the goal from a given Node.
 * @param timeout: Maximum time (in seconds) to spend performing A* search.
 * @returns A search result, * which contains the path from 'start' to a node satisfying 'goal',
 *          the cost of this path, and some statistics.
 */
export function aStarSearch<Node>(graph: Graph<Node>,
                                  start: Node,
                                  goal: (n: Node) => boolean,
                                  heuristics: (n: Node) => number,
                                  timeout: number, ): SearchResult<Node> {
    // Find timeout time
    const endTime = Date.now() + timeout * 1000;

    // Frontier is a priority queue of nodes that will be examined, it is sorted by the estimated cost of nodes
    const frontier: PriorityQueue<SearchNode<Node>> =
        new PriorityQueue<SearchNode<Node>>((nodeA, nodeB) => nodeB.totalCost() - nodeA.totalCost());

    // Set of explored nodes, these will not be examined again
    const visited: Set<Node> = new Set();

    // Initialize frontier and visited with start node
    frontier.add(new SearchNode<Node>(0, 0, {child: start, action: null, cost: 0}, null));
    visited.add(start);

    // Loop until we explored all nodes connected to start
    while (!frontier.isEmpty()) {
        // Test for timeout
        if (Date.now() > endTime) {
            return new SearchResult<Node>("timeout", [], -1, visited.size());
        }

        // Find node with min path + heuristic length
        const currentNode = frontier.dequeue();

        // Test if we reached the goal
        if (goal(currentNode.node.child)) {
            return new SearchResult<Node>(
                "success",
                ReconstructPathFromSearchNode(currentNode),
                currentNode.path,
                visited.size());
        }

        // We are not at the goal, find unvisited successors
        const successors: Array<Successor<Node>> = graph.successors(currentNode.node.child)
            .filter((value) => !visited.contains(value.child));

        // Add them to visited and frontier
        for (const successor of successors) {
            visited.add(successor.child);
            frontier.add(new SearchNode<Node>(
                currentNode.path + successor.cost,
                heuristics(successor.child),
                successor,
                currentNode));
        }
    }

    // We explored all nodes connected to start, but none lead to goal.
    return new SearchResult<Node>("failure", null, null, visited.size());
}

/**
 * Stores additional node information for aStartSearch.
 */
class SearchNode<Node> {
    // Cost of path up to this node
    public path: number;

    // Estimated cost to goal from this node
    public heuristic: number;

    // The represented node
    public node: Successor<Node>;

    // The previous node. This implicitly saves the entire path
    public previous: SearchNode<Node> | null;

    constructor(path: number, heuristic: number, node: Successor<Node>, previous: SearchNode<Node> | null) {
        this.path = path;
        this.heuristic = heuristic;
        this.node = node;
        this.previous = previous;
    }

    /**
     * The total estimated cost of a path over this node
     */
    public totalCost(): number {
        return this.path + this.heuristic;
    }
}

/**
 * Reconstruct a path from searchNode by visiting all linked nodes.
 * @param {SearchNode<Node>} searchNode: Final node of path (contains links to previous nodes)
 * @returns {Array<Successor<Node>>} Path from start to search node
 */
function ReconstructPathFromSearchNode<Node>(searchNode: SearchNode<Node>): Array<Successor<Node>> {
    const path: Array<Successor<Node>> = [];

    // Iterate over all links and reconstruct list of nodes
    let current: SearchNode<Node> = searchNode;
    do {
        path.push(current.node);
        current = current.previous;
    } while (current != null);

    // Reverse order since this list was built from end to start
    // Skip the first item, since the start node is not expected in the path
    return path.reverse().slice(1);
}
