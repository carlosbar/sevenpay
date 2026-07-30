// src/server.ts
import express from 'express';
import { AdvanceController } from './controllers/advanceController';
import { errorHandler } from './middlewares/responseHandler';

const app = express();
app.use(express.json());

const advanceController = new AdvanceController();

// Core Route Endpoint for testing the Credit Engine
app.post('/api/v1/advances/request', (req, res, next) => advanceController.requestAdvance(req, res, next));

// Global Error Interceptor (Must be defined LAST in the express pipeline)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SevenPay Core Credit Engine running on port ${PORT}`);
});
