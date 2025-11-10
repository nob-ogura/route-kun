import { createTrpcHandler } from './handler';

const handler = createTrpcHandler();

export { handler as GET, handler as POST };
