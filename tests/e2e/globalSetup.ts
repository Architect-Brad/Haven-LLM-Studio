import { HavenServer } from '../../src/server/index.js';

let server: HavenServer | null = null;

export async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  server = new HavenServer();
  await server.start();
}

export async function teardown(): Promise<void> {
  if (server) {
    (server as any).httpServer?.close();
  }
}
