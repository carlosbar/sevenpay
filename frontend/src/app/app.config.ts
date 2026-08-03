import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		// Activates high-performance Zoneless mode driven entirely by our Angular Signals
		provideExperimentalZonelessChangeDetection(),
		provideRouter(routes),
		provideHttpClient()
	]
};
