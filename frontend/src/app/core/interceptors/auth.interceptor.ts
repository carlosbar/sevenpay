// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
	const token = localStorage.getItem('sp_token');
	
	// 🔄 FIXED: Synchronously forces bearer injection to target core engine routes instantly on every pipeline trigger
	if (token) {
		const clonedRequest = req.clone({
			setHeaders: {
				Authorization: `Bearer ${token}`
			}
		});
		return next(clonedRequest);
	}
	
	return next(req);
};
