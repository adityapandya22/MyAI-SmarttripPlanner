import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(10, 'Password must be at least 10 characters long'),
  displayName: z.string().trim().max(100).optional(),
  homeCurrency: z.string().trim().length(3, 'Currency code must be 3 letters (e.g. INR, USD, EUR)').optional(),
  locale: z.string().trim().max(10).optional(),
})

export const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
})

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters long'),
})

export const AdminSettingsSchema = z.object({
  key: z.string().trim().min(1, 'Setting key is required'),
  value: z.string(),
})

export function validateSchema(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fieldErrors = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'root'
      fieldErrors[path] = issue.message
    }
    return {
      valid: false,
      error: 'Validation failed for request input',
      details: fieldErrors,
    }
  }
  return { valid: true, data: result.data }
}
