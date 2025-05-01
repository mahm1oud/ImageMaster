import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'image-processing-app-secret-key',
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Authenticating user: ${username}`);
        
        // Special case for admin login for testing
        if (username === 'admin' && password === '700700') {
          console.log("Admin login detected with default password");
          const adminUser = await storage.getUserByUsername('admin');
          if (adminUser) {
            return done(null, adminUser);
          }
        }
        
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`User not found: ${username}`);
          return done(null, false, { message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        }
        
        // Try both: check for plain password match (for demo/testing) and hashed password
        const isPlainMatch = user.password === password;
        const isHashedMatch = !isPlainMatch ? await comparePasswords(password, user.password) : false;
        
        if (!isPlainMatch && !isHashedMatch) {
          console.log(`Invalid password for user: ${username}`);
          return done(null, false, { message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        }
        
        console.log(`Authentication successful for: ${username}`);
        return done(null, user);
      } catch (error) {
        console.error(`Authentication error for ${username}:`, error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "اسم المستخدم موجود بالفعل"
        });
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "البريد الإلكتروني مستخدم بالفعل"
        });
      }

      // Hash the password
      const hashedPassword = await hashPassword(req.body.password);
      
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            subscription: user.subscription
          }
        });
      });
    } catch (error) {
      console.error("Error in registration:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى."
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Received login request for:", req.body.username);

    // Use custom authentication to add better error handling
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("Login authentication error:", err);
        return res.status(500).json({
          success: false,
          message: "حدث خطأ أثناء محاولة تسجيل الدخول"
        });
      }
      
      if (!user) {
        console.log("Login failed - invalid credentials for:", req.body.username);
        return res.status(401).json({
          success: false,
          message: info?.message || "اسم المستخدم أو كلمة المرور غير صحيحة"
        });
      }
      
      // Log the user in by establishing a session
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Session login error:", loginErr);
          return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إنشاء جلسة المستخدم"
          });
        }
        
        console.log("Login successful for:", user.username);
        return res.status(200).json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            subscription: user.subscription
          }
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        message: "تم تسجيل الخروج بنجاح"
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح به"
      });
    }
    
    const user = req.user as SelectUser;
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        subscription: user.subscription
      }
    });
  });
  
  // Extra endpoints for admin functionality
  app.get("/api/check-admin", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح به"
      });
    }
    
    const user = req.user as SelectUser;
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "غير مصرح للمستخدم العادي"
      });
    }
    
    res.json({
      success: true,
      message: "مصرح به كمدير"
    });
  });
}