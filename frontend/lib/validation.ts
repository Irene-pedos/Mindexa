// frontend/lib/validation.ts

export const passwordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export interface ValidationError {
  field: string;
  message: string;
}

export function validateEmail(email: string): ValidationError | null {
  if (!email) {
    return { field: "email", message: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { field: "email", message: "Please enter a valid email address" };
  }

  return null;
}

export function validatePassword(password: string): ValidationError | null {
  if (!password) {
    return { field: "password", message: "Password is required" };
  }

  if (password.length < passwordRequirements.minLength) {
    return {
      field: "password",
      message: `Password must be at least ${passwordRequirements.minLength} characters long`,
    };
  }

  if (passwordRequirements.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      field: "password",
      message: "Password must contain at least one uppercase letter",
    };
  }

  if (passwordRequirements.requireLowercase && !/[a-z]/.test(password)) {
    return {
      field: "password",
      message: "Password must contain at least one lowercase letter",
    };
  }

  if (passwordRequirements.requireNumbers && !/\d/.test(password)) {
    return {
      field: "password",
      message: "Password must contain at least one number",
    };
  }

  if (
    passwordRequirements.requireSpecialChars &&
    !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  ) {
    return {
      field: "password",
      message:
        "Password must contain at least one special character (!@#$%^&* etc)",
    };
  }

  return null;
}

export function validatePasswordMatch(
  password: string,
  confirmPassword: string,
): ValidationError | null {
  if (password !== confirmPassword) {
    return { field: "confirmPassword", message: "Passwords do not match" };
  }
  return null;
}

export function validateName(
  name: string,
  fieldName: string,
): ValidationError | null {
  if (!name || name.trim() === "") {
    return { field: fieldName, message: `${fieldName} is required` };
  }

  if (name.length > 100) {
    return {
      field: fieldName,
      message: `${fieldName} must be less than 100 characters`,
    };
  }

  if (name.length < 1) {
    return {
      field: fieldName,
      message: `${fieldName} must be at least 1 character`,
    };
  }

  return null;
}

export function validateRequired(
  value: string,
  fieldName: string,
  fieldId: string,
): ValidationError | null {
  if (!value || value.trim() === "") {
    return { field: fieldId, message: `${fieldName} is required` };
  }
  return null;
}

export interface SignupValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateSignupForm(data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "STUDENT" | "LECTURER";
  regNumber?: string;
  college?: string;
  department?: string;
  option?: string;
  level?: string;
  year?: string;
}): SignupValidationResult {
  const errors: Record<string, string> = {};

  const firstNameError = validateName(data.firstName, "First name");
  if (firstNameError) errors[firstNameError.field] = firstNameError.message;

  const lastNameError = validateName(data.lastName, "Last name");
  if (lastNameError) errors[lastNameError.field] = lastNameError.message;

  const emailError = validateEmail(data.email);
  if (emailError) errors[emailError.field] = emailError.message;

  const passwordError = validatePassword(data.password);
  if (passwordError) errors[passwordError.field] = passwordError.message;

  if (!errors.password) {
    const matchError = validatePasswordMatch(
      data.password,
      data.confirmPassword,
    );
    if (matchError) errors[matchError.field] = matchError.message;
  }

  // Role-specific validation
  const collegeError = validateRequired(data.college || "", "College", "college");
  if (collegeError) errors.college = collegeError.message;

  const departmentError = validateRequired(data.department || "", "Department", "department");
  if (departmentError) errors.department = departmentError.message;

  if (data.role === "STUDENT") {
    const regError = validateRequired(data.regNumber || "", "Registration Number", "regNumber");
    if (regError) errors.regNumber = regError.message;

    const optionError = validateRequired(data.option || "", "Option", "option");
    if (optionError) errors.option = optionError.message;

    const levelError = validateRequired(data.level || "", "Level", "level");
    if (levelError) errors.level = levelError.message;

    const yearError = validateRequired(data.year || "", "Year", "year");
    if (yearError) errors.year = yearError.message;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface LoginValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateLoginForm(data: {
  email: string;
  password: string;
}): LoginValidationResult {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(data.email);
  if (emailError) errors[emailError.field] = emailError.message;

  if (!data.password) {
    errors.password = "Password is required";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface ResetPasswordValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateResetPasswordForm(data: {
  password: string;
  confirmPassword: string;
}): ResetPasswordValidationResult {
  const errors: Record<string, string> = {};

  const passwordError = validatePassword(data.password);
  if (passwordError) errors[passwordError.field] = passwordError.message;

  if (!errors.password) {
    const matchError = validatePasswordMatch(
      data.password,
      data.confirmPassword,
    );
    if (matchError) errors[matchError.field] = matchError.message;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
