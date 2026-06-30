import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import config from "../config";

interface DecodedToken extends JwtPayload {
  sub: string;
  "custom:role"?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
  }
}

export const authMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const secret = config.jwtSecret || "dev-secret";
      const verified = jwt.verify(token, secret) as DecodedToken;
      const userRole = (verified && verified["custom:role"]) || "";
      req.user = {
        id: verified.sub,
        role: userRole,
      };

      const hasAccess = allowedRoles.includes(userRole.toLowerCase());
      if (!hasAccess) {
        res.status(403).json({ message: "Access Denied" });
        return;
      }
    } catch (err) {
      console.error("Failed to verify token:", err);
      if (config.nodeEnv !== "production") {
        try {
          const decoded = jwt.decode(token) as DecodedToken | null;
          if (decoded && decoded.sub) {
            const userRole = (decoded && decoded["custom:role"]) || "";
            console.warn("Auth: using decoded token without verification (development only).", decoded);
            req.user = { id: decoded.sub, role: userRole };
            const hasAccess = allowedRoles.includes(userRole.toLowerCase());
            if (!hasAccess) {
              res.status(403).json({ message: "Access Denied" });
              return;
            }
          } else {
            res.status(401).json({ message: "Invalid or expired token" });
            return;
          }
        } catch (decodeErr) {
          res.status(401).json({ message: "Invalid or expired token" });
          return;
        }
      } else {
        res.status(401).json({ message: "Invalid or expired token" });
        return;
      }
    }

    next();
  };
};

export const allowSelfOrRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const secret = config.jwtSecret || "dev-secret";
      const verified = jwt.verify(token, secret) as DecodedToken;
      const userRole = (verified && verified["custom:role"]) || "";
      req.user = { id: verified.sub, role: userRole };

      // Allow if token subject matches the cognitoId param (self update)
      const targetId = req.params.cognitoId || req.params.id;
      if (targetId && verified.sub && (verified.sub === targetId)) {
        next();
        return;
      }

      const hasAccess = allowedRoles.includes(userRole.toLowerCase());
      if (!hasAccess) {
        res.status(403).json({ message: "Access Denied" });
        return;
      }
    } catch (err) {
      console.error("Failed to verify token for allowSelfOrRole:", err);
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    next();
  };
};

export const authRequired = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    try {
      const secret = config.jwtSecret || "dev-secret";
      const verified = jwt.verify(token, secret) as DecodedToken;
      const userRole = (verified && verified["custom:role"]) || "";
      req.user = { id: verified.sub, role: userRole };
    } catch (err) {
      console.error("Failed to verify token:", err);
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
    next();
  };
};
