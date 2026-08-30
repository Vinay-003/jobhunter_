import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

type Schemas = {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
};

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // Express 4: req.query is mutable; overwrite with parsed values
        Object.assign(req.query as Record<string, unknown>, parsed);
        // also replace reference for downstream use
        (req as unknown as { query: unknown }).query = parsed;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const ze = err as ZodError;
        const rawIssues: Array<{ path: PropertyKey[]; message: string }> = ((ze as unknown as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues ??
          (ze as unknown as { errors: Array<{ path: PropertyKey[]; message: string }> }).errors ?? []) as Array<{ path: PropertyKey[]; message: string }>;
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: rawIssues.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

export default validate;
