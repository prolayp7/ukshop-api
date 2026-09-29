import { Request } from 'express';

export interface AuthenticatedCustomer {
  id: number;
  uuid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface CustomerRequest extends Request {
  customer?: AuthenticatedCustomer;
}
