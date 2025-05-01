import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: text("role").default("user").notNull(),
  subscription: text("subscription").default("free").notNull(),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  dailyUsageLimit: integer("daily_usage_limit").default(10).notNull(),
  dailyUsageCount: integer("daily_usage_count").default(0).notNull(),
  usageResetDate: timestamp("usage_reset_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  originalName: text("original_name").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  processed: boolean("processed").default(false),
});

export const processedImages = pgTable("processed_images", {
  id: serial("id").primaryKey(),
  originalImageId: integer("original_image_id").references(() => images.id),
  userId: integer("user_id").references(() => users.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  processingType: text("processing_type").notNull(),
  processingOptions: jsonb("processing_options"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const stats = pgTable("stats", {
  id: serial("id").primaryKey(),
  date: timestamp("date").defaultNow().notNull(),
  toolName: text("tool_name").notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  keyValue: text("key_value").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsed: timestamp("last_used"),
  active: boolean("active").default(true),
});

// Analytics for dashboard insights
export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  toolUsed: text("tool_used").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  duration: integer("duration"),  // in milliseconds
  imageSize: integer("image_size"), // in bytes
  resultSize: integer("result_size"), // in bytes
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
});

// Subscription plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // in cents
  currency: text("currency").default("USD").notNull(),
  interval: text("interval").default("month").notNull(), // month, year
  features: jsonb("features"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  dailyLimit: integer("daily_limit").default(10).notNull(),
  maxFileSize: integer("max_file_size").default(10485760).notNull(), // 10MB in bytes
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin activity logs
export const adminLogs = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => users.id),
  action: text("action").notNull(),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Site settings
export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value"),
  category: text("category").default("general").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
});

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  images: many(images),
  processedImages: many(processedImages),
  apiKeys: many(apiKeys),
  analytics: many(analytics),
}));

export const imagesRelations = relations(images, ({ one, many }) => ({
  user: one(users, {
    fields: [images.userId],
    references: [users.id],
  }),
  processedImages: many(processedImages),
}));

export const processedImagesRelations = relations(processedImages, ({ one }) => ({
  originalImage: one(images, {
    fields: [processedImages.originalImageId],
    references: [images.id],
  }),
  user: one(users, {
    fields: [processedImages.userId],
    references: [users.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  role: true,
  subscription: true,
});

export const insertImageSchema = createInsertSchema(images).omit({
  id: true,
  createdAt: true,
});

export const insertProcessedImageSchema = createInsertSchema(processedImages).omit({
  id: true,
  createdAt: true,
});

export const insertStatsSchema = createInsertSchema(stats).omit({
  id: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsed: true,
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  timestamp: true,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertImage = z.infer<typeof insertImageSchema>;
export type Image = typeof images.$inferSelect;

export type InsertProcessedImage = z.infer<typeof insertProcessedImageSchema>;
export type ProcessedImage = typeof processedImages.$inferSelect;

export type InsertStats = z.infer<typeof insertStatsSchema>;
export type Stats = typeof stats.$inferSelect;

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type SiteSetting = typeof siteSettings.$inferSelect;

// Tool options
export const imageUploadSchema = z.object({
  files: z.array(z.instanceof(File)).min(1, "يجب اختيار ملف واحد على الأقل").max(10, "الحد الأقصى هو 10 ملفات"),
});

export const compressOptionsSchema = z.object({
  quality: z.number().min(1).max(100).default(80),
  format: z.enum(["jpg", "png", "webp"]).default("jpg"),
  keepMetadata: z.boolean().default(false),
});

export const resizeOptionsSchema = z.object({
  width: z.number().min(1).max(5000).optional(),
  height: z.number().min(1).max(5000).optional(),
  maintainAspectRatio: z.boolean().default(true),
  resizeMode: z.enum(["exact", "percent", "fit"]).default("exact"),
  percent: z.number().min(1).max(200).default(100),
});

export const cropOptionsSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
});

export const convertOptionsSchema = z.object({
  format: z.enum(["jpg", "png", "webp", "gif", "tiff", "svg"]),
  quality: z.number().min(1).max(100).default(80),
});

export const watermarkOptionsSchema = z.object({
  type: z.enum(["text", "image"]),
  text: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontColor: z.string().optional(),
  opacity: z.number().min(0).max(1).default(0.5),
  position: z.enum(["topLeft", "topRight", "bottomLeft", "bottomRight", "center"]).default("bottomRight"),
  imageId: z.number().optional(),
  padding: z.number().min(0).max(100).default(10),
});

export const enlargeOptionsSchema = z.object({
  scale: z.number().min(1).max(4).default(2),
  mode: z.enum(["standard", "highQuality"]).default("highQuality"),
  format: z.enum(["jpg", "png", "webp"]).default("jpg"),
});

export const blurFaceOptionsSchema = z.object({
  intensity: z.number().min(1).max(100).default(20),
  faceOnly: z.boolean().default(true),
  mode: z.enum(["blur", "pixelate", "blackout"]).default("blur"),
});

export const apiResponse = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.any().optional(),
});

export type ApiResponse = z.infer<typeof apiResponse>;
export type CompressOptions = z.infer<typeof compressOptionsSchema>;
export type ResizeOptions = z.infer<typeof resizeOptionsSchema>;
export type CropOptions = z.infer<typeof cropOptionsSchema>;
export type ConvertOptions = z.infer<typeof convertOptionsSchema>;
export type WatermarkOptions = z.infer<typeof watermarkOptionsSchema>;
export type EnlargeOptions = z.infer<typeof enlargeOptionsSchema>;
export type BlurFaceOptions = z.infer<typeof blurFaceOptionsSchema>;
