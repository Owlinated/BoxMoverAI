import {Dictionary, PriorityQueue, Set} from "typescript-collections";
import {IGraph, SearchResult, Successor} from "./Graph";

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
export function aStarSearch<Node>(graph: IGraph<Node>,
                                  start: Node,
                                  goal: (n: Node) => boolean,
                                  heuristics: (n: Node) => number,
                                  timeout: number, ): SearchResult<Node> {
    // Find timeout time
    const endTime = Date.now() + timeout * 1000;

    // Frontier is a collection of nodes that will be examined
    const frontier: Frontier<Node> = new Frontier<Node>();

    // Set of discovered nodes
    const discovered: Set<Node> = new Set();

    // Initialize frontier and visited with start node
    frontier.add(new SearchNode<Node>(0, 0, {child: start, action: "", cost: 0}, undefined));
    discovered.add(start);

    // Loop until we explored all nodes connected to start
    while (true) {
        // Test for timeout
        if (Date.now() > endTime) {
            return new SearchResult<Node>("timeout", [], -1, discovered.size());
        }

        // Find node with min path cost + heuristic
        const currentNode = frontier.dequeue();
        if (currentNode === undefined) {
            // We explored all nodes connected to start, but none lead to goal.
            return new SearchResult<Node>("failure", [], -1, discovered.size());
        }

        // Test if we reached the goal
        if (goal(currentNode.node.child)) {
            return new SearchResult<Node>(
                "success",
                currentNode.reconstructPath(),
                currentNode.pathCost,
                discovered.size());
        }

        // We are not at the goal, find the successors
        const successors: Array<Successor<Node>> = graph.successors(currentNode.node.child);

        // Update successors with shorter pathCost
        for (const successor of successors) {
            // Find search node in frontier
            const searchNode = frontier.get(successor.child);
            if (searchNode !== undefined && searchNode.pathCost > currentNode.pathCost + successor.cost) {
                // Remark: We cannot update existing items in the queue
                // Instead we insert a new search node for the existing node
                frontier.add(new SearchNode<Node>(
                    currentNode.pathCost + successor.cost,
                    searchNode.heuristic,
                    successor,
                    currentNode));
            }
        }

        // Add unvisited successors to visited and frontier
        const unvisitedSuccessors = successors.filter((value) => !discovered.contains(value.child));
        for (const successor of unvisitedSuccessors) {
            discovered.add(successor.child);
            frontier.add(new SearchNode<Node>(
                currentNode.pathCost + successor.cost,
                heuristics(successor.child),
                successor,
                currentNode));
        }
    }
}

/**
 * Stores additional node information for aStartSearch.
 */
class SearchNode<Node> {
    // Cost of path up to this node
    public pathCost: number;

    // Estimated cost to goal from this node
    public heuristic: number;

    // The represented node
    public node: Successor<Node>;

    // The previous node. This implicitly saves the entire path
    public previous: SearchNode<Node> | undefined;

    constructor(path: number, heuristic: number, node: Successor<Node>, previous: SearchNode<Node> | undefined) {
        this.pathCost = path;
        this.heuristic = heuristic;
        this.node = node;
        this.previous = previous;
    }

    /**
     * The total estimated cost of a path over this node
     */
    public totalCost(): number {
        return this.pathCost + this.heuristic;
    }

    /**
     * Reconstruct a path from this node by visiting all linked nodes.
     * @returns {Array<Successor<Node>>} Path from start to search node
     */
    public reconstructPath(): Array<Successor<Node>> {
        const path: Array<Successor<Node>> = [];

        // Iterate over all links and reconstruct list of nodes
        let current: SearchNode<Node> | undefined = this;
        do {
            path.push(current.node);
            current = current.previous;
        } while (current !== undefined);

        // Reverse order since this list was built from end to start
        // Skip the first item, since the start node is not expected in the path
        return path.reverse().slice(1);
    }
}

/**
 * Combines a priority queue with a dictionary, to allow quick ordered and lookup access to frontier
 */
class Frontier<Node> {
    // Priority queue for quick access to next element
    private queue: PriorityQueue<SearchNode<Node>> =
        new PriorityQueue<SearchNode<Node>>((nodeA: SearchNode<Node>, nodeB: SearchNode<Node>) =>
            nodeB.totalCost() - nodeA.totalCost());

    // Dictionary for quick access by node
    private nodeDictionary: Dictionary<Node, SearchNode<Node>> =
        new Dictionary<Node, SearchNode<Node>>();

    /**
     * Add search node to all internal collections
     * @param {SearchNode<Node>} searchNode: The new item
     */
    public add(searchNode: SearchNode<Node>): void {
        this.queue.add(searchNode);
        this.nodeDictionary.setValue(searchNode.node.child, searchNode);
    }

    /**
     * Get and remove the node with the lowest estimated cost
     * @returns {SearchNode<Node> | undefined}
     */
    public dequeue(): SearchNode<Node> | undefined {
        const result = this.queue.dequeue();
        if (result !== undefined) {
            this.nodeDictionary.remove(result.node.child);
        }
        return result;
    }

    /**
     * Get the search node associated with node
     * @param {Node} node: The node that is part of the resulting search node
     * @returns {SearchNode<Node> | undefined} A search node that contains node
     */
    public get(node: Node): SearchNode<Node> | undefined {
        return this.nodeDictionary.getValue(node);
    }
}
