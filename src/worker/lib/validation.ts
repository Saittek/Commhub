const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

export interface SignupInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  usernameOrEmail: string;
  password: string;
}

export function validateSignup(input: SignupInput): string | null {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return "Username must be 3-32 characters and use letters, numbers, or underscores.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    return "Please enter a valid email address.";
  }

  if (input.password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
}

export function validateLogin(input: LoginInput): string | null {
  if (!input.usernameOrEmail.trim()) {
    return "Username or email is required.";
  }

  if (!input.password) {
    return "Password is required.";
  }

  return null;
}

export function normalizeSignup(input: SignupInput): SignupInput {
  return {
    username: input.username.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
}

export function normalizeLogin(input: LoginInput): LoginInput {
  return {
    usernameOrEmail: input.usernameOrEmail.trim(),
    password: input.password,
  };
}

const DISPLAY_NAME_PATTERN = /^[\s\S]{1,32}$/;

export interface UpdateProfileInput {
  displayName: string;
}

export interface UpdateEmailInput {
  email: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function validateUpdateProfile(input: UpdateProfileInput): string | null {
  const displayName = input.displayName.trim();

  if (!displayName) {
    return "Display name is required.";
  }

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return "Display name must be 1-32 characters.";
  }

  return null;
}

export function validateUpdateEmail(input: UpdateEmailInput): string | null {
  const email = input.email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return "Please enter a valid email address.";
  }

  return null;
}

export function validateChangePassword(input: ChangePasswordInput): string | null {
  if (!input.currentPassword) {
    return "Current password is required.";
  }

  if (input.newPassword.length < 8) {
    return "New password must be at least 8 characters.";
  }

  if (input.currentPassword === input.newPassword) {
    return "New password must be different from your current password.";
  }

  return null;
}

export function normalizeUpdateProfile(input: UpdateProfileInput): UpdateProfileInput {
  return {
    displayName: input.displayName.trim(),
  };
}

export function normalizeUpdateEmail(input: UpdateEmailInput): UpdateEmailInput {
  return {
    email: input.email.trim().toLowerCase(),
  };
}

export function normalizeChangePassword(input: ChangePasswordInput): ChangePasswordInput {
  return {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  };
}
