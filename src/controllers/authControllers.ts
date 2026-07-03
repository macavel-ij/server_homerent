import { Request, Response } from "express";
import { Tenant } from "../models/tenantModel";
import { Manager } from "../models/managerModel";
import { User } from "../models/userModel";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../config";

type PasswordStrength = "weak" | "medium" | "strong";

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

const getPasswordStrength = (password: string): PasswordStrength => {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_\-+={[}\]|\\:;"'<>.,?/~`]/.test(password);
  const categories = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (password.length >= 10 && categories >= 3) {
    return "strong";
  }

  if (password.length >= 8 && categories >= 2) {
    return "medium";
  }

  return "weak";
};

const createPlaceholderPasswordHash = async (): Promise<string> => {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(`google-${Date.now()}-${Math.random().toString(36).slice(2)}`, salt);
};

const verifyGoogleToken = async (idToken: string) => {
  const configuredClientIds = [process.env.GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());

  if (configuredClientIds.length === 0) {
    console.warn("Google auth: no server-side Google client ID found; skipping audience validation.");
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw new Error("Google sign-in could not be verified.");
  }

  const payload = await response.json();
  if (configuredClientIds.length > 0 && !configuredClientIds.includes(payload.aud)) {
    throw new Error("Google sign-in audience mismatch.");
  }

  if (!payload.email || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) {
    throw new Error("Google sign-in issuer mismatch.");
  }

  return payload;
};

const normalizeUsernameFromFullName = (fullName: string): string => {
  const normalized = String(fullName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^[0-9]+/, "")
    .replace(/_+/g, "")
    .replace(/-+/g, "");

  return normalized || "googleuser";
};

const buildAlphaSuffix = (index: number) => {
  let value = index;
  let result = "";

  while (value >= 0) {
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  }

  return result;
};

const generateUniqueUsername = async (fullName: string, excludeUserId?: string) => {
  const base = normalizeUsernameFromFullName(fullName);
  let candidate = base;
  let attempt = 0;

  while (true) {
    const existingUser = await User.findOne({
      username: candidate,
      ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
    }).exec();

    if (!existingUser) {
      return candidate;
    }

    attempt += 1;
    candidate = `${base}${buildAlphaSuffix(attempt - 1)}`;
    if (attempt > 100) {
      return `${base}x`;
    }
  }
};

export const signInWithGoogle = async (req: Request, res: Response) => {
  try {
    const { idToken, role } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    const googleProfile = await verifyGoogleToken(idToken);
    const email = String(googleProfile.email || "").toLowerCase();
    const fullName = String(googleProfile.name || googleProfile.given_name || email.split("@")[0] || "Google User");
    const usernameBase = fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .replace(/^_+|_+$/g, "") || "googleuser";

    if (!email) {
      return res.status(400).json({ message: "Google account email is missing" });
    }

    let user = await User.findOne({ email }).exec();

    if (!user) {
      const normalizedRole = String(role || "").toLowerCase();
      if (!normalizedRole || !["tenant", "manager"].includes(normalizedRole)) {
        return res.status(200).json({
          message: "Complete your Google sign-up",
          requiresRoleSelection: true,
          user: { email, name: fullName },
        });
      }

      const username = await generateUniqueUsername(fullName);
      const passwordHash = await createPlaceholderPasswordHash();
      user = new User({
        username,
        email,
        passwordHash,
        role: normalizedRole,
        authProvider: "google",
      });

      const savedUser = await user.save();
      const cognitoId = savedUser._id.toString();
      if (normalizedRole === "manager") {
        const newManager = new Manager({ cognitoId, email, name: fullName });
        await newManager.save();
      } else {
        const newTenant = new Tenant({ cognitoId, email, name: fullName, favorites: [] });
        await newTenant.save();
      }

      const token = jwt.sign(
        { sub: cognitoId, "custom:role": normalizedRole },
        config.jwtSecret || "dev-secret",
        { expiresIn: "7d" }
      );

      return res.status(201).json({
        message: "Google sign-up successful",
        token,
        user: {
          id: cognitoId,
          username: savedUser.username,
          email: savedUser.email,
          role: normalizedRole,
          authProvider: "google",
        },
      });
    }

    if (user.authProvider && user.authProvider !== "google") {
      return res.status(409).json({ message: "This email is already registered with a different sign-in method." });
    }

    user.authProvider = "google";
    user.lastSeen = new Date();
    user.username = user.username || `${usernameBase}_${Math.random().toString(36).slice(2, 6)}`;
    await user.save();

    const token = jwt.sign(
      { sub: user._id.toString(), "custom:role": user.role },
      config.jwtSecret || "dev-secret",
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Google sign-in successful",
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        authProvider: "google",
      },
    });
  } catch (err: any) {
    console.error("Google sign-in error:", err);
    res.status(500).json({ message: err.message || "Google sign-in failed" });
  }
};

export const signUp = async (req: Request, res: Response) => {
	try {
		const { username, email, password, role } = req.body;

		// Validate input
		if (!username || !email || !password || !role) {
			return res.status(400).json({ message: "Username, email, password, and role are required" });
		}

		// Validate email format
		if (!isValidEmail(email)) {
			return res.status(400).json({ message: "Please provide a valid email address" });
		}

		// Validate username format (only letters allowed, generated from full name)
		const usernameRegex = /^[a-z0-9_]{3,}$/;
		if (!usernameRegex.test(username)) {
			return res.status(400).json({ message: "Username must be at least 3 characters and contain only lowercase letters, numbers, and underscores" });
		}

		// Check if user already exists
		const existingUser = await User.findOne({ $or: [{ username }, { email }] }).exec();
		if (existingUser) {
			return res.status(409).json({ message: "Username or email already exists" });
		}

		const passwordStrength = getPasswordStrength(password);
		if (passwordStrength !== "strong") {
			return res.status(400).json({
				message:
					"Password must be strong. Use at least 10 characters with uppercase, lowercase, numbers, and symbols.",
			});
		}

		// Hash password
		const salt = await bcryptjs.genSalt(10);
		const passwordHash = await bcryptjs.hash(password, salt);

		// Create user in User collection
		const newUser = new User({
			username,
			email,
			passwordHash,
			role: role.toLowerCase(),
			authProvider: "local",
		});

		const savedUser = await newUser.save();

		// Create corresponding profile based on role
		const cognitoId = savedUser._id.toString();
		if (role.toLowerCase() === "manager") {
			const newManager = new Manager({
				cognitoId,
				email,
				name: username,
			});
			await newManager.save();
		} else {
			const newTenant = new Tenant({
				cognitoId,
				email,
				name: username,
				favorites: [],
			});
			await newTenant.save();
		}

		// Generate JWT token
		const token = jwt.sign(
			{ sub: cognitoId, "custom:role": role.toLowerCase() },
			config.jwtSecret || "dev-secret",
			{ expiresIn: "7d" }
		);

		res.status(201).json({
			message: "Sign up successful",
			token,
			user: {
				id: cognitoId,
				username,
				email,
				role: role.toLowerCase(),
				authProvider: "local",
			},
		});
	} catch (err: any) {
		console.error("Sign up error:", err);
		res.status(500).json({ message: err.message || "Sign up failed" });
	}
};

export const signIn = async (req: Request, res: Response) => {
	try {
		const { loginId, password } = req.body;

		// Validate input
		if (!loginId || !password) {
			return res.status(400).json({ message: "Login ID (username/email) and password are required" });
		}

		// Find user by username or email
		const user = await User.findOne({ $or: [{ username: loginId }, { email: loginId }] }).exec();

		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		if (user.authProvider === "google") {
			return res.status(401).json({ message: "This account uses Google sign-in. Please use Continue with Google." });
		}

		// Compare passwords
		const passwordMatch = await bcryptjs.compare(password, user.passwordHash);
		if (!passwordMatch) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		// Update lastSeen
		user.lastSeen = new Date();
		await user.save();

		// Generate JWT token
		const token = jwt.sign(
			{ sub: user._id.toString(), "custom:role": user.role },
			config.jwtSecret || "dev-secret",
			{ expiresIn: "7d" }
		);

		res.json({
			message: "Sign in successful",
			token,
			user: {
				id: user._id.toString(),
				username: user.username,
				email: user.email,
				role: user.role,
				authProvider: user.authProvider || "local",
			},
		});
	} catch (err: any) {
		console.error("Sign in error:", err);
		res.status(500).json({ message: err.message || "Sign in failed" });
	}
};

export const getMe = async (req: Request, res: Response) => {
	try {
		const user = req.user;
		if (!user || !user.id) return res.status(401).json({ message: "Unauthorized" });

		const role = (user.role || "").toLowerCase();
		if (role === "manager") {
			const m = await Manager.findOne({ cognitoId: user.id }).exec();
			if (!m) return res.status(404).json({ message: "Manager not found" });
			return res.json(m);
		}

		// default to tenant
		const t = await Tenant.findOne({ cognitoId: user.id }).exec();
		if (!t) return res.status(404).json({ message: "Tenant not found" });
		return res.json(t);
	} catch (err: any) {
		res.status(500).json({ message: err.message });
	}
};

export const changePassword = async (req: Request, res: Response) => {
	try {
		const user = req.user;
		if (!user || !user.id) return res.status(401).json({ message: "Unauthorized" });

		const { currentPassword, newPassword, confirmPassword } = req.body;

		// Validate input
		if (!currentPassword || !newPassword || !confirmPassword) {
			return res.status(400).json({ message: "All password fields are required" });
		}

		if (newPassword !== confirmPassword) {
			return res.status(400).json({ message: "New passwords do not match" });
		}

		// Validate new password strength
		const passwordStrength = getPasswordStrength(newPassword);
		if (passwordStrength !== "strong") {
			return res.status(400).json({ 
				message: "Password must be strong. Use at least 10 characters with letters, numbers, and symbols.",
				strength: passwordStrength
			});
		}

		// Get user by ID
		const foundUser = await User.findById(user.id).exec();
		if (!foundUser) {
			return res.status(404).json({ message: "User not found" });
		}

		if (foundUser.authProvider === "google") {
			return res.status(403).json({ message: "Google-authenticated accounts do not use password changes." });
		}

		// Verify current password
		const passwordMatch = await bcryptjs.compare(currentPassword, foundUser.passwordHash);
		if (!passwordMatch) {
			return res.status(401).json({ message: "Current password is incorrect" });
		}

		// Hash new password
		const salt = await bcryptjs.genSalt(10);
		const newPasswordHash = await bcryptjs.hash(newPassword, salt);

		// Update password
		foundUser.passwordHash = newPasswordHash;
		await foundUser.save();

		res.json({ message: "Password changed successfully" });
	} catch (err: any) {
		console.error("Change password error:", err);
		res.status(500).json({ message: err.message || "Password change failed" });
	}
};

export const updateMe = async (req: Request, res: Response) => {
	try {
		const user = req.user;
		if (!user || !user.id) return res.status(401).json({ message: "Unauthorized" });

		const { name, email, phoneNumber } = req.body;
		const role = (user.role || "").toLowerCase();

		// Validate email if provided
		if (email && !isValidEmail(email)) {
			return res.status(400).json({ message: "Please provide a valid email address" });
		}

		// Check if email is already used by another user
		if (email) {
			const existingUser = await User.findOne({ email, _id: { $ne: user.id } }).exec();
			if (existingUser) {
				return res.status(409).json({ message: "Email already in use" });
			}
		}

		if (role === "manager") {
			const updated = await Manager.findOneAndUpdate(
				{ cognitoId: user.id },
				{ ...(name && { name }), ...(email && { email }), ...(phoneNumber && { phoneNumber }) },
				{ new: true }
			).exec();
			if (!updated) return res.status(404).json({ message: "Manager not found" });

			const userUpdates: any = {};
			if (email) userUpdates.email = email;
			if (name) userUpdates.username = await generateUniqueUsername(name, user.id);
			if (Object.keys(userUpdates).length > 0) {
				await User.findByIdAndUpdate(user.id, userUpdates).exec();
			}

			return res.json(updated);
		}

		const updated = await Tenant.findOneAndUpdate(
			{ cognitoId: user.id },
			{ ...(name && { name }), ...(email && { email }), ...(phoneNumber && { phoneNumber }) },
			{ new: true }
		).exec();
		if (!updated) return res.status(404).json({ message: "Tenant not found" });

		const userUpdates: any = {};
		if (email) userUpdates.email = email;
		if (name) userUpdates.username = await generateUniqueUsername(name, user.id);
		if (Object.keys(userUpdates).length > 0) {
			await User.findByIdAndUpdate(user.id, userUpdates).exec();
		}

		return res.json(updated);
	} catch (err: any) {
		res.status(500).json({ message: err.message });
	}
};
