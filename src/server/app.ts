import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { registerApiRoutes } from './routes.ts';
import { registerMaterialRoutes } from './materialRoutes.ts';
import { registerAssignmentRoutes } from './assignmentRoutes.ts';
import { registerAssessmentRoutes } from './assessmentRoutes.ts';
import { registerAssessmentCenterRoutes } from './assessmentCenterRoutes.ts';
import { registerAcademicClassroomRoutes } from './academicClassroomRoutes.ts';
import { registerClassroomWorkspaceRoutes } from './classroomWorkspaceRoutes.ts';
import { registerClassroomSettingsRoutes } from './classroomSettingsRoutes.ts';
import { registerClassroomDirectoryRoutes } from './classroomDirectoryRoutes.ts';
import { registerUserManagementRoutes } from './userManagementRoutes.ts';
import { registerDashboardRoutes } from './dashboardRoutes.ts';
import { registerSystemSettingsRoutes } from './systemSettingsRoutes.ts';
import { registerKnowledgeCenterRoutes } from './knowledgeCenterRoutes.ts';

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

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB limit for multipart uploads (audio/images/xlsx)
    },
  });

  await registerAcademicClassroomRoutes(app);
  await registerClassroomWorkspaceRoutes(app);
  await registerClassroomSettingsRoutes(app);
  await registerClassroomDirectoryRoutes(app);
  await registerMaterialRoutes(app);
  await registerAssignmentRoutes(app);
  await registerAssessmentRoutes(app);
  await registerAssessmentCenterRoutes(app);
  await registerUserManagementRoutes(app);
  await registerDashboardRoutes(app);
  await registerSystemSettingsRoutes(app);
  await registerKnowledgeCenterRoutes(app);
  await registerApiRoutes(app);

  return app;
}
