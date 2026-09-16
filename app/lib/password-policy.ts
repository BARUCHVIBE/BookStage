export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export function normalizeLoginEmail(value: string) {
  return value.trim().toLowerCase();
}

export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `A senha deve ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (!/[A-Z]/.test(password))
    return "A senha deve conter ao menos uma letra maiúscula.";
  if (!/[a-z]/.test(password))
    return "A senha deve conter ao menos uma letra minúscula.";
  if (!/[0-9]/.test(password))
    return "A senha deve conter ao menos um número.";
  return null;
}
