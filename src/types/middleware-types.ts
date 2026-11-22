import { Request, Response } from "express";

export interface AuthenticatedRequest extends Request {
  //context: { userId: number }
  headers: { [key: string]: string; "user-id": string };
  query: { [key: string]: string | string[] };
}

export interface CustomResponse<T> extends Response {
  body: T;
}

export interface JwtToken {
  sub: number;
}
