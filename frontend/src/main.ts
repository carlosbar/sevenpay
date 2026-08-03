import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';

// 🔄 FIXED: Bootstrapping application binding the functional cryptographic security interceptor layer
bootstrapApplication(AppComponent, {
	providers: [
		provideHttpClient(
			withInterceptors([authInterceptor])
		)
	]
}).catch((err) => console.error(err));
