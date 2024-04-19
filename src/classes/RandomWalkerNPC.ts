import { SCENE_LIST } from "./../lib/constants.js";
import {
  between,
  degToRad,
  distanceBetween,
  radToDeg,
} from "./../lib/utils.js";
import { Direccion, Estado, Seat } from "./../types/src.types.js";
import Vector2 from "./Vector2.js";
import GameTimer from "./GameTimer.js";
import { Socket, Server as SocketIOServer } from "socket.io";

export default class RandomWalkerNPC {
  private direction!: Vector2;
  private animacion: Direccion | null = null;
  private speed: number = 60;
  private npc!: {
    displayWidth: number;
    displayHeight: number;
    texture: string;
  };
  private clients: Set<Socket>;
  private world: {
    height: number;
    width: number;
  };
  private state!: Estado;
  private lastPositionCheckTime: number = 0;
  private idleProbability: number = 0.3;
  private obs: {
    x: number;
    y: number;
    displayHeight: number;
    displayWidth: number;
  }[];
  private lastIdleTime: number = 0;
  private previousPosition: Vector2;
  private lastDirection: Direccion | null = null;
  private moveCounter: number = 0;
  private sitting: boolean;
  private gameTimer: GameTimer;
  private randomSeat: Seat | null = null;
  private seats: Seat[];
  private avoid: {
    x: number;
    y: number;
    displayHeight: number;
    displayWidth: number;
  }[];

  constructor(sceneIndex: number, spriteIndex: number, socket: SocketIOServer) {
    this.gameTimer = new GameTimer();
    this.clients = new Set();
    this.sitting = false;
    this.seats = SCENE_LIST[sceneIndex].seats;
    this.avoid = SCENE_LIST[sceneIndex].avoid;
    this.previousPosition = new Vector2(
      SCENE_LIST[sceneIndex].sprite[spriteIndex].x,
      SCENE_LIST[sceneIndex].sprite[spriteIndex].y
    );
    this.npc = {
      texture: SCENE_LIST[sceneIndex].sprite[spriteIndex].texture,
      displayWidth: SCENE_LIST[sceneIndex].sprite[spriteIndex].displayWidth,
      displayHeight: SCENE_LIST[sceneIndex].sprite[spriteIndex].displayHeight,
    };
    this.direction = new Vector2(
      SCENE_LIST[sceneIndex].sprite[spriteIndex].x,
      SCENE_LIST[sceneIndex].sprite[spriteIndex].y
    );
    this.obs = SCENE_LIST[sceneIndex].obs;
    this.world = {
      height: SCENE_LIST[sceneIndex].world.height,
      width: SCENE_LIST[sceneIndex].world.width,
    };

    this.setRandomDirection();
  }

  getState(): {
    direccion: Direccion | null;
    direccionX: number;
    direccionY: number;
    state: Estado;
    randomSeat: Seat | null;
  } {
    return {
      direccion: this.animacion,
      direccionX: this.direction.x,
      direccionY: this.direction.y,
      state: this.state,
      randomSeat: this.randomSeat,
    };
  }

  private setRandomDirection() {
    console.log("choose random");
    if (
      Date.now() > this.lastIdleTime + 30000 &&
      Math.random() < this.idleProbability
    ) {
      console.log("idle");
      this.goIdle();
    } else if (++this.moveCounter >= between(7, 13)) {
      console.log("sit");
      this.goSit();
    } else {
      console.log("move");

      this.goMove();
    }
  }

  update(deltaTime: number) {
    if (this.state !== Estado.Inactivo) {
      this.willCollide();
      if (!this.sitting) {
        this.comprobarBordesDelMundo();
        this.actualizarAnimacion();
        this.comprobarUbicacion();
      }
    }
    this.gameTimer.tick(deltaTime);
  }

  private actualizarAnimacion() {
    const dx = this.direction.x;
    const dy = this.direction.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    let direccion: Direccion | null = null;
    if (Math.abs(absX - absY) <= Math.max(absX, absY) * 0.3) {
      if (dx > 0 && dy > 0) {
        direccion = Direccion.DerechaAbajo;
      } else if (dx > 0 && dy < 0) {
        direccion = Direccion.DerechaArriba;
      } else if (dx < 0 && dy > 0) {
        direccion = Direccion.IzquierdaAbajo;
      } else if (dx < 0 && dy < 0) {
        direccion = Direccion.IzquierdaArriba;
      }
    } else if (absX > absY) {
      direccion = dx > 0 ? Direccion.Derecha : Direccion.Izquierda;
    } else {
      direccion = dy > 0 ? Direccion.Abajo : Direccion.Arriba;
    }

    this.animacion = direccion;
  }

  private willCollide() {
    let npcMiddleX = this.direction.x;
    let npcMiddleY = this.direction.y;
    let npcTopY = this.direction.y - this.npc.displayHeight / 2;
    let npcBottomY = this.direction.y + this.npc.displayHeight / 2;
    let npcLeftX = this.direction.x - this.npc.displayWidth / 2;
    let npcRightX = this.direction.x + this.npc.displayWidth / 2;
    let blockedDirections: Direccion[] = [];

    this.avoid.forEach((obstacle) => {
      let obstacleMiddleY = obstacle.y - obstacle.displayHeight / 2;
      let obstacleTopY = obstacle.y - obstacle.displayHeight;
      let obstacleLeftX = obstacle.x - obstacle.displayWidth;
      let obstacleBottomY = obstacle.y;
      let obstacleRightX = obstacle.x;

      if (Math.abs(npcMiddleY - obstacleMiddleY) < this.npc.displayHeight / 2) {
        if (npcRightX >= obstacleLeftX && npcLeftX < obstacleLeftX) {
          blockedDirections.push(Direccion.Derecha);
        }
        if (npcLeftX <= obstacleRightX && npcRightX > obstacleRightX) {
          blockedDirections.push(Direccion.Izquierda);
        }
        if (npcTopY < obstacleBottomY && npcBottomY > obstacleTopY) {
          if (npcMiddleX >= obstacleLeftX && npcMiddleX < obstacleRightX) {
            if (npcBottomY > obstacleTopY) {
              blockedDirections.push(Direccion.Abajo);
            }
            if (npcTopY < obstacleBottomY) {
              blockedDirections.push(Direccion.Arriba);
            }
          }
        }
      }
    });

    if (blockedDirections.length > 0) {
      if (this.sitting) {
        this.adjustPathTowardsChair(blockedDirections);
      } else {
        let availableDirections = Object.values(Direccion).filter(
          (dir) => !blockedDirections.includes(dir)
        );

        if (availableDirections.includes(this.lastDirection!)) {
          this.updateDirection(this.lastDirection, blockedDirections);
        } else {
          let newDirection =
            availableDirections.length > 0 ? availableDirections[0] : null;
          this.lastDirection = newDirection;
          this.updateDirection(newDirection, blockedDirections);
        }
      }
    }
  }

  private adjustPathTowardsChair(blockedDirections: Direccion[]) {
    const increment = 5;
    const maxAttempts = 36;
    let adjustedAngle = radToDeg(
      Math.atan2(
        Number(this.randomSeat?.adjustedY) - this.direction.y,
        Number(this.randomSeat?.adjustedX) - this.direction.x
      )
    );

    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        adjustedAngle =
          (adjustedAngle +
            (i % 2 == 0 ? 1 : -1) * increment * (Math.floor(i / 2) + 1)) %
          360;
      }

      this.direction = new Vector2(
        Math.cos(degToRad(adjustedAngle)),
        Math.sin(degToRad(adjustedAngle))
      ).scale(this.speed);

      if (!this.isDirectionBlocked(this.direction, blockedDirections)) {
        this.actualizarAnimacion();
        break;
      }
    }
  }

  private isDirectionBlocked(
    vector: Vector2,
    blockedDirections: Direccion[]
  ): boolean {
    let predominantDirection: Direccion;
    if (Math.abs(vector.x) > Math.abs(vector.y)) {
      predominantDirection =
        vector.x > 0 ? Direccion.Derecha : Direccion.Izquierda;
    } else {
      predominantDirection = vector.y > 0 ? Direccion.Abajo : Direccion.Arriba;
    }

    return blockedDirections.includes(predominantDirection);
  }

  private attemptToFindPath(
    targetAngle: number,
    blockedDirections: Direccion[]
  ) {
    const increment = 5;
    for (let i = 0; i < 360 / increment; i++) {
      let angle = (targetAngle + i * increment) % 360;
      let dirVector = new Vector2(
        Math.cos(degToRad(angle)),
        Math.sin(degToRad(angle))
      ).scale(this.speed);
      if (!this.isDirectionBlocked(dirVector, blockedDirections)) {
        this.direction = this.direction;
        this.actualizarAnimacion();
        return;
      }
    }
  }

  private updateDirection(
    direction: Direccion | null,
    blockedDirections: Direccion[]
  ) {
    if (!direction) {
      let targetAngle =
        this.sitting && this.randomSeat
          ? radToDeg(
              Math.atan2(
                Number(this.randomSeat?.adjustedY) - this.direction.y,
                Number(this.randomSeat?.adjustedX) - this.direction.x
              )
            )
          : between(0, 360);
      this.attemptToFindPath(targetAngle, blockedDirections);
      return;
    } else {
      let angle;
      switch (direction) {
        case Direccion.Arriba:
          angle = -90;
          break;
        case Direccion.Abajo:
          angle = 90;
          break;
        case Direccion.Izquierda:
          angle = 180;
          break;
        default:
          angle = 0;
          break;
      }
      this.direction = new Vector2(
        Math.cos(degToRad(angle)),
        Math.sin(degToRad(angle))
      ).scale(this.speed);
      this.actualizarAnimacion();
    }
  }

  private goIdle() {
    this.state = Estado.Inactivo;
    this.animacion = Direccion.Inactivo;
    const numero = between(5000, 20000);
    this.gameTimer.setTimeout(() => {
      this.lastIdleTime = Date.now();
      this.setRandomDirection();
    }, numero);
  }

  private goMove() {
    this.moveCounter++;
    this.state = Estado.Moverse;
    const angle = between(0, 360);
    this.direction = new Vector2(Math.cos(angle), Math.sin(angle)).scale(
      this.speed
    );
    this.actualizarAnimacion();
  }

  private comprobarUbicacion() {
    if (Date.now() > this.lastPositionCheckTime + 15000) {
      const distance = distanceBetween(
        this.direction.x,
        this.direction.y,
        this.previousPosition.x,
        this.previousPosition.y
      );
      if (distance < 50) {
        this.setRandomDirection();
      }
      this.previousPosition.set(this.direction.x, this.direction.y);
      this.lastPositionCheckTime = Date.now();
    }
  }

  private comprobarBordesDelMundo() {
    const nextX = this.direction.x;
    const nextY = this.direction.y;
    let blockedRight = false;
    let blockedLeft = false;
    let blockedUp = false;
    let blockedDown = false;

    if (nextX >= this.world.width - this.npc.displayWidth / 2) {
      blockedRight = true;
    } else if (nextX <= this.npc.displayWidth / 2) {
      blockedLeft = true;
    } else if (nextY >= this.world.height - this.npc.displayHeight / 2) {
      blockedDown = true;
    } else if (nextY <= this.npc.displayHeight / 2) {
      blockedUp = true;
    }

    if (!blockedRight && !blockedLeft && !blockedDown && !blockedUp) {
      this.obs.forEach((ob) => {
        if (
          nextX < ob.x + ob.displayWidth &&
          nextX + this.npc.displayWidth > ob.x &&
          nextY < ob.y + ob.displayHeight &&
          nextY + this.npc.displayHeight > ob.y
        ) {
          if (nextX + this.npc.displayWidth / 2 > ob.x) blockedRight = true;
          else if (nextX < ob.x + ob.displayWidth) blockedLeft = true;
          else if (nextY + this.npc.displayHeight / 2 > ob.y)
            blockedDown = true;
          else if (nextY < ob.y + ob.displayHeight) blockedUp = true;
        }
      });
    }

    let newAngle = 0;
    if (blockedRight) newAngle = between(90, 270);
    else if (blockedLeft) newAngle = between(-90, 90);
    if (blockedDown) newAngle = between(180, 360);
    else if (blockedUp) newAngle = between(0, 180);
    this.direction = new Vector2(
      Math.cos(degToRad(newAngle)),
      Math.sin(degToRad(newAngle))
    ).scale(this.speed);

    this.actualizarAnimacion();
  }

  private goSit() {
    this.sitting = true;
    this.randomSeat = this.seats[between(0, this.seats.length - 1)];
    const dx = Number(this.randomSeat?.adjustedX) - this.direction.x;
    const dy = Number(this.randomSeat?.adjustedY) - this.direction.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = (distance / this.speed) * 1000;
    const angle = Math.atan2(dy, dx);
    this.direction = new Vector2(Math.cos(angle), Math.sin(angle)).scale(
      this.speed
    );
    this.actualizarAnimacion();

    this.gameTimer.setTimeout(() => {
      this.animacion = this.randomSeat?.anim!;
      this.state = Estado.Sentado;

      this.gameTimer.setTimeout(() => {
        this.sitting = false;
        this.randomSeat = null;
        this.moveCounter = 0;
        this.setRandomDirection();
      }, between(15000, 30000));
    }, duration);
  }

  registerClient(socket: Socket) {
    this.clients.add(socket);
  }

  unregisterClient(socket: Socket) {
    this.clients.delete(socket);
  }
}
