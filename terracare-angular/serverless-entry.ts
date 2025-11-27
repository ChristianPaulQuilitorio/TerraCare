import { app } from './server';

// Export the Express app instance as the default export. Vercel's Node runtime
// can accept an Express-compatible request handler as a serverless function.
export default app();
