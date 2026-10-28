import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User, { UserRole } from "../src/models/User";

const SALT_ROUNDS = 12;

class SeedConfigurationError extends Error {}

interface SeedUser {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const getSeedUsers = (): SeedUser[] => {
  const { MANAGER_PASSWORD, STAFF_PASSWORD } = process.env;

  if (!MANAGER_PASSWORD || !STAFF_PASSWORD) {
    throw new SeedConfigurationError(
      "MANAGER_PASSWORD and STAFF_PASSWORD must both be set before seeding."
    );
  }

  for (const [variable, password] of [
    ["MANAGER_PASSWORD", MANAGER_PASSWORD],
    ["STAFF_PASSWORD", STAFF_PASSWORD],
  ] as const) {
    if (password.length < 8 || password.length > 128) {
      throw new SeedConfigurationError(`${variable} must be 8–128 characters.`);
    }
  }

  return [
    {
      name: "RBAC Test Manager",
      email: normalizeEmail("manager@test.com"),
      role: "manager",
      password: MANAGER_PASSWORD,
    },
    {
      name: "RBAC Test Staff",
      email: normalizeEmail("staff@test.com"),
      role: "staff",
      password: STAFF_PASSWORD,
    },
  ];
};

const main = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new SeedConfigurationError("MONGODB_URI is missing.");
  }

  const seedUsers = getSeedUsers();
  await mongoose.connect(mongoUri);

  try {
    for (const seedUser of seedUsers) {
      if (await User.exists({ email: seedUser.email })) {
        console.log(`Account already exists; no changes made: ${seedUser.email}`);
        continue;
      }

      const passwordHash = await bcrypt.hash(seedUser.password, SALT_ROUNDS);
      try {
        await User.create({
          name: seedUser.name,
          email: seedUser.email,
          passwordHash,
          role: seedUser.role,
        });
        console.log(`Account created: ${seedUser.email} (${seedUser.role})`);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ) {
          console.log(
            `Account already exists; no changes made: ${seedUser.email}`
          );
          continue;
        }
        throw error;
      }
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  const message =
    error instanceof SeedConfigurationError
      ? error.message
      : "RBAC user seeding failed. Check database connectivity and configuration.";
  console.error(message);
  process.exitCode = 1;
});
