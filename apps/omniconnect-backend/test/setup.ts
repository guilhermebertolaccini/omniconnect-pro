// Jest setup file.
//
// We intentionally do NOT instantiate a real PrismaClient here. Most unit
// tests in this codebase mock Prisma entirely (see *.service.spec.ts); the
// few that need a live DB should set up their own client inside the test
// file so we don't crash when DATABASE_URL is absent (e.g. in CI without a
// dedicated test database).

beforeAll(async () => {
  // Reserved for future global setup (e.g. dedicated integration test DB).
});

afterAll(async () => {
  // Reserved for future global teardown.
});
