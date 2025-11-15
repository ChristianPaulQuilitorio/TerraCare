// Lightweight Vercel function shim
// The project is deployed as a static build by default. The original file
// attempted to load an Angular Universal server bundle (dist/.../server/server.mjs)
// which isn't produced for a static deploy. To avoid runtime import errors on
// Vercel, this handler returns a helpful 501 response explaining the situation.

export default async function handler(req, res) {
  res.statusCode = 501;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: 'server_not_deployed',
    message: 'This Vercel function is disabled because the Angular Universal server bundle is not included in static deployments. Build with SSR and include server bundle if you need server-side rendering or server APIs here.'
  }));
}
