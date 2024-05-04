import { Escena, Seat } from "./../types/src.types";
import RandomWalkerNPC from "./RandomWalkerNPC.js";
import PF from "pathfinding";
import { Worker } from "worker_threads";

export default class EscenaEstudio {
  readonly key: string;
  npcs: RandomWalkerNPC[] = [];
  sillasOcupadas: Seat[] = [];
  private worker: Worker;

  constructor(escena: Escena) {
    this.key = escena.key;

    let width: number =
        escena.world.width -
        (escena.sprites?.[0]?.displayWidth * escena.sprites?.[0]?.escala.x) / 2,
      height: number =
        escena.world.height -
        (escena.sprites?.[0]?.displayHeight * escena.sprites?.[0]?.escala.y) /
          2;

    this.npcs = escena.sprites.map((sprite) => {
      return new RandomWalkerNPC(
        sprite,
        this.sillasOcupadas,
        escena.sillas,
        this.initializeGrid(escena, width, height),
        {
          width,
          height,
        }
      );
    });

    this.worker = new Worker(new URL("./../gameLoop.js", import.meta.url), {
      workerData: {
        npcs: this.npcs.map((npc) => npc.getState()),
        key: this.key,
      },
    });

    this.worker.on("message", (update: { deltaTime: number }) => {
      this.npcs.forEach((npc) => npc.update(update.deltaTime));
    });
    this.worker.postMessage({ cmd: "start" });
  }

  private initializeGrid(
    escena: Escena,
    width: number,
    height: number
  ): {
    grid: PF.Grid;
    astar: PF.AStarFinder;
  } {
    const grid = new PF.Grid(width, height);

    escena.prohibited.forEach((area) => {
      const startX = Math.max(0, area.x);
      const endX = Math.min(width - 1, area.x + area.width - 1);
      const startY = Math.max(0, area.y);
      const endY = Math.min(height - 1, area.y + area.height - 1);
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          grid.setWalkableAt(x, y, false);
        }
      }
    });

    return {
      grid,
      astar: new PF.AStarFinder({
        diagonalMovement: 1,
      }),
    };
  }
}
