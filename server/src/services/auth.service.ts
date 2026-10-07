import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import User, { UserRole } from "../models/User";
import { AuthenticatedUser } from "../types/auth.types";
import { AppError } from "../utils/AppError";

const SALT_ROUNDS = 12;

export class AuthServiceError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: 400 | 401 | 409
  ) {
    super(
      message,
      statusCode,
      statusCode === 409
        ? "USER_EMAIL_TAKEN"
        : statusCode === 401
          ? "INVALID_CREDENTIALS"
          : "AUTH_VALIDATION_ERROR"
    );
    this.name = "AuthServiceError";
  }
}

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const toSafeUser = (user: {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
}): SafeUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }

  return secret;
};

export const registerUser = async (input: RegisterUserInput) => {
  const email = input.email.trim().toLowerCase();

  if (input.role !== undefined && input.role !== "staff") {
    throw new AuthServiceError("New accounts can only register as staff", 400);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const user = await User.create({
      name: input.name.trim(),
      email,
      passwordHash,
      role: "staff",
    });

    return toSafeUser(user);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new AuthServiceError("An account with this email already exists", 409);
    }

    throw error;
  }
};

export const loginUser = async ({ email, password }: LoginInput) => {
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    "+passwordHash"
  );

  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthServiceError("Invalid email or password", 401);
  }

  const token = jwt.sign({ sub: user._id.toString() }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "1h",
  });

  return {
    token,
    user: toSafeUser(user),
  };
};

export const getAuthenticatedUser = async (
  userId: string
): Promise<AuthenticatedUser | null> => {
  const user = await User.findById(userId);

  if (!user) {
    return null;
  }

  return toSafeUser(user);
};

export const verifyAccessToken = (token: string): string => {
  const verified = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  if (
    typeof verified === "string" ||
    typeof verified.sub !== "string" ||
    !Types.ObjectId.isValid(verified.sub)
  ) {
    throw new jwt.JsonWebTokenError("Invalid token subject");
  }

  return verified.sub;
};
