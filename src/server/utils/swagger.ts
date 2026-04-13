import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { Express, Request, Response } from 'express';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

let spec: Record<string, unknown> | null = null;

function getSpec(): Record<string, unknown> {
  if (!spec) {
    const searchPaths = [
      join(process.cwd(), 'docs', 'api', 'openapi.yaml'),
      join(dirname(process.argv[1] || '.'), '..', '..', '..', 'docs', 'api', 'openapi.yaml'),
      join(__dirname, '..', '..', '..', '..', 'docs', 'api', 'openapi.yaml'),
    ];

    for (const p of searchPaths) {
      try {
        const raw = readFileSync(p, 'utf-8');
        spec = yaml.load(raw) as Record<string, unknown>;
        break;
      } catch {
        continue;
      }
    }

    if (!spec) {
      spec = {
        openapi: '3.1.0',
        info: { title: 'Haven LLM Studio API', version: '0.1.0' },
        paths: {},
      };
    }
  }
  return spec;
}

export function setupSwagger(app: Express): void {
  const doc = getSpec();

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(doc, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Haven LLM Studio API Docs',
  }));

  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.json(getSpec());
  });
}
