import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ success: true, data }, { status })

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

export function fail(e: unknown) {
  if (e instanceof AppError) return err(e.code, e.message, e.status)
  if (e instanceof ZodError) return err('INVALID_INPUT', 'Some of the details sent were not valid.', 400)
  console.error(e)
  return err('INTERNAL', 'Something went wrong. Please try again.', 500)
}
