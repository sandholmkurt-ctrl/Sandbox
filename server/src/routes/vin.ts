import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { decodeVin } from '../services/vinDecoder';

const router = Router();
router.use(authMiddleware);

router.get('/decode/:vin', async (req: AuthRequest, res: Response) => {
  try {
    const { vin } = req.params;
    if (!vin || vin.length !== 17) {
      res.status(400).json({ error: 'VIN must be exactly 17 characters' });
      return;
    }

    const result = await decodeVin(vin);
    if (!result) {
      res.status(404).json({ error: 'Could not decode VIN. Please enter vehicle details manually.' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('VIN decode route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
