# Plann Backend

NestJS API for Plann, backed by Prisma and MySQL. It provides JWT authentication plus user-scoped category, goal, and task endpoints.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and update both MySQL connection strings and `JWT_SECRET`.

3. Create the `plann` and `plann_shadow` MySQL databases. The configured database user needs full access to both. The shadow database is used only by Prisma during local migrations.

4. Apply the schema and seed the five system categories:

   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```

5. Start the API:

   ```bash
   npm run start:dev
   ```

The API runs at `http://localhost:4000`. Swagger documentation is available at `http://localhost:4000/api/docs`.

## Commands

- `npm run build` — compile the production bundle
- `npm run lint` — run ESLint
- `npm test -- --runInBand` — run unit tests
- `npm run prisma:generate` — regenerate Prisma Client
- `npm run prisma:migrate` — create/apply a local migration
- `npm run prisma:seed` — seed default categories

## API overview

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /categories`
- `GET|POST /goals`, `GET|PATCH|DELETE /goals/:id`
- `GET|POST /tasks`, `PATCH|DELETE /tasks/:id`

All category, goal, and task routes require a Bearer token. Goal progress is derived from linked task completion whenever a goal is fetched.
