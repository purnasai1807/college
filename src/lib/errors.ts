import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}

export function fail(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ success: false, error: { code: "BAD_INPUT", message: "Some fields are invalid." } }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}
