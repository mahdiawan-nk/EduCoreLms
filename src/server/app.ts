import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import { registerApiRoutes } from './routes.ts';
import { registerMaterialRoutes } from './materialRoutes.ts';
import { registerAssignmentRoutes } from './assignmentRoutes.ts';
import { registerAssessmentRoutes } from './assessmentRoutes.ts';
import { registerAcademicClassroomRoutes } from './academicClassroomRoutes.ts';

export async function buildApiServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 260 * 1024 * 1024, // 260 MB body limit for video/document presigned uploads
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret:
      process.env.SESSION_SECRET ||
      'politeknik-kampar-lms-production-secret-key',
  });

  await registerAcademicClassroomRoutes(app);
  await registerMaterialRoutes(app);
  await registerAssignmentRoutes(app);
  await registerAssessmentRoutes(app);
  await registerApiRoutes(app);

  return app;
}
