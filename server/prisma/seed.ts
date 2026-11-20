// Loads the project's .env with the same precedence as the API, so seeding cannot silently
// target a different SQLite file than the one the server reads.
import "../src/env";
import { prisma } from "../src/db";
import { hashPassword } from "../src/auth/password";
import { seedSkills } from "./seedSkills";
import { seedDemoAssessment, seedDemoPosts, seedDemoPractice } from "./seedDemo";

const DEMO_PASSWORD = "Demo@12345";

// Demo candidates carry a filled-in profile so the Profile section is not empty on a fresh database.
const demoUsers = [
  { email: "recruiter@skillgraph.test", name: "Priya Nair", role: "RECRUITER" },
  {
    email: "candidate1@skillgraph.test",
    name: "Arjun Shetty",
    role: "CANDIDATE",
    headline: "Operations analyst — reporting, client communication and supplier negotiation",
    location: "Bengaluru",
    about:
      "Three years in trading operations. I keep delivery dates honest, write the client email when something goes wrong, and rebuild the weekly sales view when the numbers stop matching.",
    yearsExperience: 3,
  },
  {
    email: "candidate2@skillgraph.test",
    name: "Meera Kulkarni",
    role: "CANDIDATE",
    headline: "Data analyst learning to turn messy tables into decisions",
    location: "Pune",
    about:
      "Two years of reporting work in a logistics team. Comfortable in SQL and spreadsheets; working on writing shorter, clearer findings.",
    yearsExperience: 2,
  },
  {
    email: "candidate3@skillgraph.test",
    name: "Rohan Fernandes",
    role: "CANDIDATE",
    headline: "Final-year student preparing for analyst roles",
    location: "Mumbai",
    about:
      "Final-year commerce student. Practising data tasks and client communication before applying for graduate analyst roles.",
    yearsExperience: 0,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production");
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const u of demoUsers) {
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { isDemo: true } });
    if (existing && !existing.isDemo) throw new Error(`Refusing to change non-demo account ${u.email}`);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, isDemo: true },
    });
  }

  console.log("Demo accounts ready (password for all: " + DEMO_PASSWORD + "):");
  for (const u of demoUsers) console.log(`  ${u.role.padEnd(9)} ${u.email}`);

  await seedSkills();

  const demo = await seedDemoAssessment();
  console.log(
    demo.created
      ? `Demo assessment ready and published: ${demo.assessmentId}`
      : demo.versionId ? "Existing demo assessment reused; missing sample attempts filled in." : "No publishable demo version found.",
  );

  await seedDemoPractice();
  console.log("Demo practice and leaderboard data ready.");

  const posts = await seedDemoPosts();
  console.log(
    posts.created > 0
      ? `Demo requirements posts ready: ${posts.created} created.`
      : "Demo requirements posts already present — skipped.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());