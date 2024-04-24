import express from "express";
import { Server as SocketIOServer, Socket } from "socket.io";
import * as http from "http";
import { Worker } from "worker_threads";
import { SCENE_LIST } from "./lib/constants.js";
import { Escena } from "./types/src.types.js";
import EscenaEstudio from "./classes/ConfigurarScene.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

class NPCStudioEngine {
  private escenas: EscenaEstudio[] = [];

  constructor() {
    SCENE_LIST.forEach((escena: Escena) => {
      this.escenas.push(new EscenaEstudio(escena));
    });

    io.on("connection", (socket: Socket) => {
      socket.on("enviarSceneIndex", (claveEscena: string) => {
        const scene = SCENE_LIST.find((e) => e.key == claveEscena);
        socket.emit("configurarEscena", {
          scene,
          state: this.escenas
            .find((e) => e.key == scene?.key)
            ?.npcs.map((npc) => npc.getState()),
        });
      });
    });
    this.startGameLoopWorker();
  }

  private startGameLoopWorker() {
    const gameLoopWorker = new Worker(new URL("gameLoop.js", import.meta.url));

    gameLoopWorker.on("message", (update: { deltaTime: number }) => {
      this.escenas.forEach((escena) => {
        escena.npcs.forEach((npc) => npc.update(update.deltaTime));
        io.emit(
          escena.key,
          escena.npcs.map((npc) => npc.getState())
        );
      });
    });

    gameLoopWorker.postMessage({
      cmd: "start",
    });
  }
}

new NPCStudioEngine();

server.listen(3000, () => {});