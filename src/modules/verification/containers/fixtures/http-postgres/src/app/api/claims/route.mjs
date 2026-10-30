import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';
export const database = new PrismaClient();
export async function POST(request) {
  const { reference } = await request.json();
  const receipt = createHmac('sha256', process.env.SESSION_SECRET).update(reference).digest('hex');
  const claim = await database.claim.create({ data: { reference, receipt } });
  return Response.json(claim, { status: 201 });
}
export async function GET() {
  return Response.json({ claims: await database.claim.findMany({ orderBy: { reference: 'asc' } }) });
}
