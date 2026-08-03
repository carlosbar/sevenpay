// src/server.ts
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import * as fs from 'fs';
import * as path from 'path';
import { errorHandler } from './middlewares/responseHandler';

const app = express();

// CRITICAL - this env var (ALLOW_CORS) should not be used in production, only for debug mode
if(process.env.ALLOW_CORS == "true") {
	// Strict Global CORS and Preflight Interceptor
	app.use((req, res, next) => {
		// Allow origin from your local server or wildcard for local test drive environments
		res.header('Access-Control-Allow-Origin', '*');
		
		// Supported methods within the SevenPay operational architecture
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		
		// Explicitly expose standard authorization headers needed for our JWT Guards
		res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
	
		// Handle browser preflight checks immediately before routing pipeline evaluates it
		if (req.method === 'OPTIONS') {
			res.sendStatus(200);
			return;
		}
		
		return next();
	});
}

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
				
				// 🔄 FLEXIBLE METRIC INTERCEPTOR: Normalizes string or array input layout structures seamlessly
				const targetMethods: string[] = Array.isArray(method) ? method : [method];

				targetMethods.forEach((m: string) => {
					const lowerMethod = m.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
					
					if (typeof app[lowerMethod] === 'function') {
						app[lowerMethod](routePath, handler);
						console.log(`[ROUTE MAPPED]: ${lowerMethod.toUpperCase()} -> ${routePath}`);
					} else {
						console.warn(`[ROUTING WARN]: Unsupported HTTP method detected -> ${m}`);
					}
				});
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
