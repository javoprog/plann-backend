import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultCategories = [
  { name: 'Work', color: '#3B82F6', icon: 'Briefcase' },
  { name: 'Education', color: '#8B5CF6', icon: 'GraduationCap' },
  { name: 'Personal', color: '#10B981', icon: 'User' },
  { name: 'Travel', color: '#F59E0B', icon: 'Plane' },
  { name: 'Health', color: '#F43F5E', icon: 'HeartPulse' },
];

async function main() {
  const systemCategoryCount = await prisma.category.count({
    where: { userId: null },
  });

  if (systemCategoryCount === 0) {
    await prisma.category.createMany({ data: defaultCategories });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
