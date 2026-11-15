import { prisma } from "../src/db";
import { slugify } from "../src/utils/slugify";
import { skillLibrary } from "./seedData/skills";

const TYPE_CODES: Record<string, string> = {
  S: "STRUCTURED_RESPONSE",
  D: "DATA_ANALYTICAL",
  F: "FILE_SUBMISSION",
};

export async function seedSkills() {
  const seenSlugs = new Set<string>();
  let skillCount = 0;
  let subskillCount = 0;

  for (const [dIndex, d] of skillLibrary.entries()) {
    const domain = await prisma.skillDomain.upsert({
      where: { slug: d.slug },
      update: { name: d.name, description: d.description, sortOrder: dIndex },
      create: { slug: d.slug, name: d.name, description: d.description, sortOrder: dIndex },
    });

    for (const [sIndex, s] of d.skills.entries()) {
      const slug = slugify(s.name);
      if (seenSlugs.has(slug)) throw new Error(`Duplicate skill slug in seed data: ${slug}`);
      seenSlugs.add(slug);

      const assessmentTypes = [...s.types]
        .map((code) => {
          const type = TYPE_CODES[code];
          if (!type) throw new Error(`Unknown assessment type code "${code}" on skill ${s.name}`);
          return type;
        })
        .join(",");

      const skill = await prisma.skill.upsert({
        where: { slug },
        update: { name: s.name, description: s.description, assessmentTypes, sortOrder: sIndex, domainId: domain.id },
        create: {
          slug,
          name: s.name,
          description: s.description,
          assessmentTypes,
          sortOrder: sIndex,
          domainId: domain.id,
        },
      });
      skillCount++;

      for (const [i, name] of s.subskills.entries()) {
        await prisma.subskill.upsert({
          where: { skillId_slug: { skillId: skill.id, slug: slugify(name) } },
          update: { name, sortOrder: i },
          create: { skillId: skill.id, slug: slugify(name), name, sortOrder: i },
        });
        subskillCount++;
      }
    }
  }

  console.log(`Skill library ready: ${skillLibrary.length} domains, ${skillCount} skills, ${subskillCount} subskills.`);
}