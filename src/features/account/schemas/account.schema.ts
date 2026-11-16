import { z } from "zod";

export const accountProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(120),
  lastName: z.string().trim().min(1, "Enter your last name.").max(120),
  phone: z.string().trim().max(50),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(12, "Use at least 12 characters.").max(128),
    confirmation: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.newPassword === value.confirmation, {
    message: "The new passwords do not match.",
    path: ["confirmation"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Choose a password different from your current password.",
    path: ["newPassword"],
  });

export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
