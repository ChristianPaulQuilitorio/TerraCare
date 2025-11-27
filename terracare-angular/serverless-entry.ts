import serverless from 'serverless-http';
import { app } from './server';

// Wrap the Express app with `serverless-http` so Vercel recognizes and invokes
// the handler as a standard serverless function. This avoids lifecycle issues
// caused by modules that attempt to start their own listener when imported.
const handler = serverless(app());
export default handler;
