import {Set} from "typescript-collections";
import {IGraph, Successor} from "./Graph";

/*
 * GridGraph
 *
 * This is an example implementation of a Graph, consisting of a 2-dimensional grid.
 * Neighbours are vertical and horizontal, so you can move in 4 different direction.
 * This file is only used by 'test-astar.ts', and not by the Shrdlite system.
 *
 * You should not edit this file.
 */

export type Coordinate = [number, number];  // [x,y] coordinate

/**
 * An implementation of a Graph node.
 */
export class GridNode {
    constructor(
        public x: number,
        public y: number,
    ) {}

    public neighbor(delta: [number, number]): GridNode {
        return new GridNode(this.x + delta[0], this.y + delta[1]);
    }

    public compareTo(other: GridNode): number {
        return (this.x - other.x) || (this.y - other.y);
    }

    public toString(): string {
        return "(" + this.x + "," + this.y + ")";
    }
}

/**
 * An implementation of a 2d grid graph.
 */
export class GridGraph implements IGraph<GridNode> {
    public static readonly actions: {[s: string]: [number, number]}
        = {L: [-1, 0], R: [+1, 0], D: [0, -1], U: [0, +1]};

    public static compareNodes(a: GridNode, b: GridNode): number {
        return a.compareTo(b);
    }

    private walls: Set<GridNode>;

    constructor(
        public xsize: number,
        public ysize: number,
        obstacles: Coordinate[],
    ) {
        this.walls = new Set<GridNode>();
        for (const [x, y] of obstacles) {
            this.walls.add(new GridNode(x, y));
        }
    }

    public successors(node: GridNode): Array<Successor<GridNode>> {
        const successors: Array<Successor<GridNode>> = [];
        for (const act of Object.keys(GridGraph.actions)) {
            const next = node.neighbor(GridGraph.actions[act]);
            if (!this.walls.contains(next) && next.x >= 0 && next.y >= 0
                && next.x < this.xsize && next.y < this.ysize) {
                successors.push({
                    action: act,
                    child: next,
                    cost: 1,
                });
            }
        }
        return successors;
    }

    public compareNodes(a: GridNode, b: GridNode): number {
        return a.compareTo(b);
    }

    public toString(start?: GridNode, goal?: (n: GridNode) => boolean, path?: Array<Successor<GridNode>>): string {
        function pathContains(path: Array<Successor<GridNode>>, n: GridNode): string | null {
            for (const p of path) {
                if (p.child.x === n.x && p.child.y === n.y) {
                    return p.action;
                }
            }
            return null;
        }
        const grid: string[][] = [new Array(4 * this.xsize + 1)];
        for (let y = 0; y < this.ysize; y++) {
            grid[2 * y + 2] = new Array(4 * this.xsize + 1);
            grid[2 * y + 1] = new Array(4 * this.xsize + 1);
            for (let x = 0; x < this.xsize; x++) {
                grid[2 * y + 2].splice(4 * x, 5, "+", " ", " ", " ", "+");
                grid[2 * y + 1].splice(4 * x, 5, " ", " ", " ", " ", " ");
                grid[2 * y + 0].splice(4 * x, 5, "+", " ", " ", " ", "+");
                if (goal && goal(new GridNode(x, y))) { grid[2 * y + 1][4 * x + 2] = "G"; }
            }
            grid[2 * y + 1][0] = grid[2 * y + 1][4 * this.xsize] = "|";
        }
        for (let x = 0; x < this.xsize; x++) {
            grid[2 * this.ysize].splice(4 * x, 5, "+", "-", "-", "-", "+");
            grid[0].splice(4 * x, 5, "+", "-", "-", "-", "+");
        }
        this.walls.forEach((node: GridNode) => {
            grid[2 * node.y + 2].splice(4 * node.x, 5, "+", "-", "-", "-", "+");
            grid[2 * node.y + 1].splice(4 * node.x, 5, "|", "#", "#", "#", "|");
            grid[2 * node.y + 0].splice(4 * node.x, 5, "+", "-", "-", "-", "+");
        });
        if (start) {
            grid[2 * start.y + 1][4 * start.x + 2] = "S";
        }
        if (path) {
            path.forEach((suc) => {
                grid[2 * suc.child.y + 1][4 * suc.child.x + 2] = (goal && goal(suc.child)) ? "G" : "O";
                switch (suc.action) {
                case "L":
                    grid[2 * suc.child.y + 1].splice(4 * suc.child.x + 3, 3, "-", "-", "-");
                    break;
                case "R":
                    grid[2 * suc.child.y + 1].splice(4 * suc.child.x - 1, 3, "-", "-", "-");
                    break;
                case "D":
                    grid[2 * suc.child.y + 2][4 * suc.child.x + 2] = "|";
                    break;
                case "U":
                    grid[2 * suc.child.y + 0][4 * suc.child.x + 2] = "|";
                    break;
                }
            });
        }
        return grid.reverse().map((row) => row.join("")).join("\n") + "\n";
    }
}
