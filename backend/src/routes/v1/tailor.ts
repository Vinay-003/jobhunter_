import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireSession } from '../../middleware/requireSession.js';
import {
  getTailorSuggestionsHandler,
  applySuggestionHandler,
  getTailoredResumeHandler,
} from '../../modules/tailoring/tailorController.js';

const router = Router();

const tailorUuidParams = validate({
  params: z.object({
    resumeId: z.string().uuid(),
    jobId: z.string().uuid(),
  }),
});

// /api/v1/tailor/:resumeId/:jobId/suggestions
router.post('/:resumeId/:jobId/suggestions', requireSession, tailorUuidParams, getTailorSuggestionsHandler);

// /api/v1/tailor/:resumeId/:jobId/apply-suggestion
router.post('/:resumeId/:jobId/apply-suggestion', requireSession, tailorUuidParams, applySuggestionHandler);

// /api/v1/tailor/:resumeId/:jobId
router.get('/:resumeId/:jobId', requireSession, tailorUuidParams, getTailoredResumeHandler);

export default router;
