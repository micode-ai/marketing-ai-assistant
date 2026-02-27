import { PrismaClient, OrgPlan, UserRole, ProjectStatus, ChecklistType, ChecklistItemPriority } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123456', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@marketingai.app' },
    update: {},
    create: {
      email: 'demo@marketingai.app',
      name: 'Demo User',
      passwordHash,
      emailVerified: true,
    },
  });

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo-org',
      plan: OrgPlan.PRO,
      members: {
        create: {
          userId: user.id,
          role: UserRole.OWNER,
          joinedAt: new Date(),
        },
      },
    },
  });

  // Create subscription
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      plan: OrgPlan.PRO,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Create demo project
  const project = await prisma.project.upsert({
    where: { id: 'demo-project-1' },
    update: {},
    create: {
      id: 'demo-project-1',
      organizationId: org.id,
      name: 'Accounting AI (eksiegowyai.pl)',
      description: 'B2B accounting automation SaaS for Polish market',
      websiteUrl: 'https://eksiegowyai.pl',
      targetAudience: 'Small and medium businesses in Poland looking to automate accounting',
      industry: 'FinTech / B2B SaaS',
      goals: {
        primary: 'Acquire 100 paying customers in Q1',
        kpis: ['MRR growth', 'CAC', 'Trial-to-paid conversion'],
        targetLeads: 500,
        targetRevenue: 10000,
      },
      brandVoice: {
        tone: ['professional', 'trustworthy', 'innovative'],
        style: 'Clear and concise, avoiding jargon',
        keywords: ['automation', 'AI', 'accounting', 'efficiency', 'Polish business'],
        avoidWords: ['cheap', 'easy', 'simple'],
        examples: [],
      },
      socialLinks: {
        linkedin: 'https://linkedin.com/company/eksiegowyai',
        twitter: 'https://twitter.com/eksiegowyai',
      },
      status: ProjectStatus.ACTIVE,
    },
  });

  // Create launch checklist
  const launchChecklist = await prisma.checklist.create({
    data: {
      projectId: project.id,
      name: 'Product Launch Checklist',
      type: ChecklistType.LAUNCH,
      description: 'Complete checklist for launching eksiegowyai.pl',
      isTemplate: false,
      items: {
        create: [
          { title: 'Set up landing page with clear value proposition', order: 1, priority: ChecklistItemPriority.CRITICAL },
          { title: 'Configure Google Analytics and conversion tracking', order: 2, priority: ChecklistItemPriority.HIGH },
          { title: 'Set up email capture form and welcome sequence', order: 3, priority: ChecklistItemPriority.HIGH },
          { title: 'Create LinkedIn Company Page', order: 4, priority: ChecklistItemPriority.MEDIUM },
          { title: 'Write and publish first 3 blog articles about AI accounting', order: 5, priority: ChecklistItemPriority.HIGH },
          { title: 'Set up Stripe for billing and free trial', order: 6, priority: ChecklistItemPriority.CRITICAL },
          { title: 'Create onboarding email sequence (7-day drip)', order: 7, priority: ChecklistItemPriority.HIGH },
          { title: 'Reach out to 50 potential customers via LinkedIn', order: 8, priority: ChecklistItemPriority.MEDIUM },
          { title: 'Submit to Product Hunt', order: 9, priority: ChecklistItemPriority.MEDIUM },
          { title: 'Set up customer support (Intercom/Crisp)', order: 10, priority: ChecklistItemPriority.HIGH },
        ],
      },
    },
  });

  // Create email list
  const emailList = await prisma.emailList.create({
    data: {
      projectId: project.id,
      name: 'Early Adopters',
      description: 'Users who signed up during beta',
      subscribers: {
        create: [
          { email: 'jan.kowalski@firma.pl', name: 'Jan Kowalski', status: 'ACTIVE' as any },
          { email: 'anna.nowak@sp.pl', name: 'Anna Nowak', status: 'ACTIVE' as any },
        ],
      },
    },
  });

  await prisma.emailList.update({
    where: { id: emailList.id },
    data: { subscriberCount: 2 },
  });

  console.log('✅ Seed completed!');
  console.log(`👤 Demo user: demo@marketingai.app / demo123456`);
  console.log(`🏢 Organization: ${org.name} (${org.slug})`);
  console.log(`📁 Project: ${project.name}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
