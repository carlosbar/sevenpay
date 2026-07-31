// src/server.ts
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import * as fs from 'fs';
import * as path from 'path';
import { errorHandler } from './middlewares/responseHandler';

const app = express();
app.use(express.json());

// --- SWAGGER CONFIGURATION ---
const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SevenPay Core Credit Engine API',
      version: '1.0.0',
      description: 'Production-ready technical documentation for SevenPay multitenant financial infrastructure.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
    ],
  },
  apis: ['./src/controllers/*.ts', './src/server.ts'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// -----------------------------

/**
 * AUTO-DISCOVERY ROUTER ENGINE
 * Dynamically scans the controllers folder and provisions the API endpoints based on their contract.
 */
async function initializeRoutes() {
  const controllersPath = path.join(__dirname, 'controllers');
  
  // Reads all files inside src/controllers
  const files = fs.readdirSync(controllersPath);

  for (const file of files) {
    // Only process TypeScript or JavaScript files, ignoring test or map files
    if (file.endsWith('.ts') || file.endsWith('.js')) {
      const fullPath = path.join(controllersPath, file);
      
      // Dynamic async import of the controller module
      const controllerModule = await import(fullPath);

      // Verifies if the file exports the required route configuration object
      if (controllerModule && controllerModule.routeConfig) {
        const { method, path: routePath, handler } = controllerModule.routeConfig;
        
        // Dynamically binds the route to the Express application matrix
        // Example: app['post']('/api/v1/auth/login', handler)
        app[method as 'get' | 'post' | 'put' | 'delete'](routePath, handler);
        
        console.log(`[ROUTE MAPPED]: ${method.toUpperCase()} -> ${routePath}`);
      }
    }
  }

  // CRITICAL: Global Error Interceptor MUST be attached AFTER all routes are provisioned
  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 SevenPay Core Engine running on port ${PORT}`);
    console.log(`📑 Interactive API documentation: http://localhost:3000/api-docs`);
  });
}

// Fire up the automation engine
initializeRoutes().catch((err) => {
  console.error('Catastrophic failure initializing SevenPay engine routes:', err);
});
