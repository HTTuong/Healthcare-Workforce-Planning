import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks an endpoint that needs no token, for example login (BR-A01).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);