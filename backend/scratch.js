const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function main() {
  const userId = '03aa304b-d57f-455d-9df1-3586b5c58b6b'; // User from previous test
  const organizationId = '6b38793f-4a37-475f-be35-bbd88b9bc706'; // Org from previous test
  const title = "test meeting";

  let orgData = {};
  if (organizationId) {
    const org = await prisma.organization.findFirst({
      where: { id: organizationId, users: { some: { id: userId } } }
    });
    if (!org) {
      console.log('Not a member of this organization');
      return;
    }
    orgData = { organizationId };
  }

  const meetingLink = crypto.randomBytes(4).toString('hex');
  const meeting = await prisma.meeting.create({
    data: {
      title,
      meetingLink,
      hostId: userId,
      startTime: new Date(),
      state: 'ONGOING',
      ...orgData
    }
  });

  console.log(meeting);
}
main().catch(console.error).finally(() => prisma.$disconnect());

