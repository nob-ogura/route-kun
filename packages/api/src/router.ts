import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  ping: t.procedure.query(() => 'pong'),
  echo: t.procedure.input(z.string()).mutation(({ input }) => input)
});

export type AppRouter = typeof appRouter;

