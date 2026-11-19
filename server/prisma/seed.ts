import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/auth/password";
import { seedSkills } from "./seedSkills";
import { seedDemoAssessment } from "./seedDemo";

const DEMO_PASSWORD = "Demo@12345";

const demoUsers = [
  { email: "recruiter@skillgraph.test", name: "Priya Nair", role: "RECRUITER" },
  { email: "candidate1@skillgraph.test", name: "Arjun Shetty", role: "CANDIDATE" },
  { email: "candidate2@skillgraph.test", name: "Meera Kulkarni", role: "CANDIDATE" },
  { email: "candidate3@skillgraph.test", name: "Rohan Fernandes", role: "CANDIDATE" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production");
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, isDemo: true },
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
      : "Demo assessment already present — skipped.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());