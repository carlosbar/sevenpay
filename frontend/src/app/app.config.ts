import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		// Enforces high-performance Zoneless mode under stable Angular 18+ specifications
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideHttpClient()
	]
};
