// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
	const token = localStorage.getItem('sp_token');
	
	console.log(`[HTTP INTERCEPTOR BROWSER LOG]: Intercepting target path -> ${req.url}`);
	
	if (token) {
		console.log(`[HTTP INTERCEPTOR KEY FOUND]: Injected Bearer substring -> Bearer ${token.substring(0, 15)}...`);
		
		const clonedRequest = req.clone({
			setHeaders: {
				Authorization: `Bearer ${token}`
			}
		});
		return next(clonedRequest);
	}
	
	console.warn(`[HTTP INTERCEPTOR WARN]: No token discovered in localStorage for path -> ${req.url}`);
	return next(req);
};
