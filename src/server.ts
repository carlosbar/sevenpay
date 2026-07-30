// src/server.ts
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { AdvanceController } from './controllers/advanceController';
import { errorHandler } from './middlewares/responseHandler';

const app = express();
app.use(express.json());

// --- SWAGGER CONFIGURATION ---
const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: { // <--- Adicionado o dois-pontos corrigido aqui
      title: 'SevenPay Core Credit Engine API',
      version: '1.0.0',
      description: 'Production-ready technical documentation for SevenPay multitenant financial infrastructure.',
    },
    servers: [ // <--- Adicionado o dois-pontos corrigido aqui
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
    ],
  },
  // Paths to files containing OpenAPI annotations
  apis: ['./src/controllers/*.ts', './src/server.ts'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Serve the interactive Swagger UI interface
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// -----------------------------

const advanceController = new AdvanceController();

// Core Route Endpoint for testing the Credit Engine
app.post('/api/v1/advances/request', (req, res, next) => advanceController.requestAdvance(req, res, next));

// Global Error Interceptor (Must be defined LAST in the express pipeline)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SevenPay Core Credit Engine running on port ${PORT}`);
  console.log(`Interactive API documentation available at: http://localhost:3000/api-docs`);
});

