import { appRouter, type AppRouter } from '@route-kun/api';
import { generateCorrelationId } from '@route-kun/api/middleware/correlation';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { cookies, headers } from 'next/headers';

const TRPC_ENDPOINT = '/api/trpc';
const USER_COOKIE_KEY = 'routekun.userId';

const resolveContext = () => {
  const cookieStore = cookies();
  const headerStore = headers();
  const userId = cookieStore.get(USER_COOKIE_KEY)?.value ?? '';
  const correlationHeader = headerStore.get('x-request-id');

  return {
    userId,
    correlationId:
      correlationHeader && correlationHeader.length > 0
        ? correlationHeader
        : generateCorrelationId()
  };
};

type TrpcContext = Awaited<ReturnType<typeof resolveContext>>;

const createResponseMeta = (ctx: TrpcContext | undefined) => {
  if (!ctx?.correlationId) {
    return {};
  }

  return {
    headers: {
      'x-correlation-id': ctx.correlationId
    }
  };
};

export const createTrpcHandler = (router: AppRouter = appRouter) => {
  return (req: Request) => {
    return fetchRequestHandler({
      endpoint: TRPC_ENDPOINT,
      req,
      router,
      createContext: resolveContext,
      responseMeta({ ctx }) {
        return createResponseMeta(ctx as TrpcContext | undefined);
      }
    });
  };
};
