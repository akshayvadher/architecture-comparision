import { type BeforeApplicationShutdown, Injectable } from '@nestjs/common';

@Injectable()
export class ReadinessService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
