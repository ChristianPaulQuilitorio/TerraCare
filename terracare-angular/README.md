# TerraCare Angular

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.12.

## Prerequisites
- Node.js 20.x (20.17+ recommended)
- npm 9+

## Scripts
- `npm start` — run dev server at http://localhost:4200
- `npm run build` — production build
- `npm test` — run unit tests (Karma/Jasmine)

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Supabase integration

This app includes a minimal SSR Express API backed by Supabase.

1) Create a `.env` file from `.env.sample` and set:

- SUPABASE_URL
- SUPABASE_ANON_KEY (optional fallback)
- SUPABASE_SERVICE_ROLE_KEY (server only)

2) Configure client env in `src/environments/environment.ts` and `.prod.ts`:

- supabaseUrl
- supabaseAnonKey

3) Database table expected: `knowledge` with columns:

- title (text)
- description (text)
- category (text, nullable)

4) Run with SSR API:

Use `npm run serve:ssr` then open the logged server URL. API endpoints:

- GET /api/health
- GET /api/knowledge
- POST /api/knowledge (protected; requires `Authorization: Bearer <JWT>`)

Auth on the server:
- A minimal auth middleware verifies the Bearer JWT using `supabase.auth.getUser(jwt)`.
- To perform writes from the server API, set `SUPABASE_SERVICE_ROLE_KEY` in `.env` and define appropriate RLS policies.

Client auth stability:
- The app configures Supabase with a Zone-safe in-memory lock and reuses a single client across HMR to avoid browser Navigator LockManager issues when using Angular + zone.js.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Run locally (Windows PowerShell)
```powershell
# Install dependencies
npm install

# Start dev server on port 4200
npm run start -- --port 4200
```

## Build for production
```powershell
npm run build
```

## Notes
- SSR is enabled; dev server will compile both browser and server bundles.
- To change the port, append `--port <number>` to the start script.
