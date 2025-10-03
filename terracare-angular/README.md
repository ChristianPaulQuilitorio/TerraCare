# TerraCare Angular

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.12.

## 🚀 Features

- **Complete Authentication System** with Supabase backend
- **User Registration & Login** with email/password
- **Password Reset** functionality
- **User Profile Management** with database storage
- **Route Protection** with authentication guards
- **Responsive Design** with SCSS styling
- **Server-Side Rendering (SSR)** enabled
- **Real-time Session Management**

## Prerequisites
- Node.js 20.x (20.17+ recommended)
- npm 9+
- Supabase account (for backend features)

## Scripts
- `npm start` — run dev server at http://localhost:4200
- `npm run build` — production build
- `npm test` — run unit tests (Karma/Jasmine)

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

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

## 🗄️ Supabase Backend Setup

This application includes a complete Supabase backend integration. To set it up:

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create an account
   - Create a new project and note your Project URL and API Key

2. **Configure Environment**
   - Update `src/environments/environment.ts` with your Supabase credentials:
   ```typescript
   export const environment = {
     production: false,
     supabase: {
       url: 'YOUR_SUPABASE_PROJECT_URL',
       key: 'YOUR_SUPABASE_ANON_KEY'
     }
   };
   ```

3. **Set Up Database**
   - See `SUPABASE_SETUP.md` for complete database setup instructions
   - Execute the provided SQL scripts in your Supabase SQL Editor

## 🔐 Authentication Features

- **User Registration**: Create new accounts with email and password
- **User Login**: Authenticate with email/password
- **Password Reset**: Send reset emails via Supabase Auth
- **Session Management**: Automatic session handling and persistence
- **Route Guards**: Protected routes for authenticated users
- **Profile Management**: User profiles stored in Supabase database

## 🏗️ Project Structure

```
src/app/
├── core/
│   ├── guards/          # Authentication and route guards
│   ├── models/          # TypeScript interfaces and types
│   └── services/        # Supabase, Auth, and User services
├── pages/               # Page components (login, signup, dashboard, etc.)
├── shared/              # Shared components (navbar, etc.)
└── environments/        # Environment configuration files
```

## 🛡️ Security Features

- **Row Level Security (RLS)** enabled on all database tables
- **JWT-based Authentication** via Supabase Auth
- **Secure Password Handling** (never stored in plaintext)
- **CORS Protection** and API rate limiting
- **Email Verification** support (configurable)

## Notes
- SSR is enabled; dev server will compile both browser and server bundles.
- To change the port, append `--port <number>` to the start script.
- Authentication requires valid Supabase credentials to function properly.
- See `SUPABASE_SETUP.md` for detailed backend setup instructions.
