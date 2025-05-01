import { 
  User, InsertUser, 
  Image, InsertImage, 
  ProcessedImage, InsertProcessedImage, 
  Stats, InsertStats, 
  ApiKey, InsertApiKey,
  SiteSetting, InsertSiteSetting,
  images, processedImages, users, stats, apiKeys, siteSettings
} from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expand IStorage with all the methods we need
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSubscription(userId: number, subscriptionData: {
    subscription: string;
    subscriptionExpiresAt: Date | null;
    dailyUsageLimit?: number;
    maxFileSize?: number;
    stripeSubscriptionId?: string | null;
  }): Promise<User>;
  
  // Image methods
  getImage(id: number): Promise<Image | undefined>;
  getImagesByUser(userId: number): Promise<Image[]>;
  createImage(image: InsertImage): Promise<Image>;
  deleteImage(id: number): Promise<boolean>;
  deleteExpiredImages(): Promise<number>;
  
  // Processed image methods
  getProcessedImage(id: number): Promise<ProcessedImage | undefined>;
  getProcessedImagesByOriginal(originalImageId: number): Promise<ProcessedImage[]>;
  getProcessedImagesByUser(userId: number): Promise<ProcessedImage[]>;
  createProcessedImage(processedImage: InsertProcessedImage): Promise<ProcessedImage>;
  deleteProcessedImage(id: number): Promise<boolean>;
  
  // Stats methods
  incrementToolUsage(toolName: string): Promise<void>;
  getToolStats(toolName: string): Promise<Stats[]>;
  getAllStats(): Promise<Stats[]>;
  
  // API Key methods
  getApiKey(keyValue: string): Promise<ApiKey | undefined>;
  getApiKeysByUser(userId: number): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKeyLastUsed(id: number): Promise<boolean>;
  deleteApiKey(id: number): Promise<boolean>;
  
  // Subscription methods
  createSubscriptionLog(userId: number, subscriptionData: {
    planId: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    paymentMethod: string;
    amount: number;
  }): Promise<void>;
  
  // Site settings methods
  getSiteSetting(key: string): Promise<SiteSetting | undefined>;
  getAllSiteSettings(): Promise<SiteSetting[]>;
  createSiteSetting(setting: InsertSiteSetting): Promise<SiteSetting>;
  updateSiteSetting(key: string, value: any, updatedBy: number): Promise<SiteSetting | undefined>;
  deleteSiteSetting(key: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private usersByUsername: Map<string, User>;
  private usersByEmail: Map<string, User>;
  private images: Map<number, Image>;
  private processedImages: Map<number, ProcessedImage>;
  private statsMap: Map<string, Stats>;
  private apiKeys: Map<number, ApiKey>;
  private apiKeysByValue: Map<string, ApiKey>;
  private subscriptionLogs: Map<number, any>; // Simple subscription log storage
  private siteSettings: Map<string, SiteSetting>;
  
  private currentUserId: number;
  private currentImageId: number;
  private currentProcessedImageId: number;
  private currentStatsId: number;
  private currentApiKeyId: number;
  private currentSubscriptionLogId: number;

  constructor() {
    this.users = new Map();
    this.usersByUsername = new Map();
    this.usersByEmail = new Map();
    this.images = new Map();
    this.processedImages = new Map();
    this.statsMap = new Map();
    this.apiKeys = new Map();
    this.apiKeysByValue = new Map();
    this.subscriptionLogs = new Map();
    this.siteSettings = new Map();
    
    this.currentUserId = 1;
    this.currentImageId = 1;
    this.currentProcessedImageId = 1;
    this.currentStatsId = 1;
    this.currentApiKeyId = 1;
    this.currentSubscriptionLogId = 1;
    
    // Create upload directories if they don't exist
    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      // Create required directories
      const uploadsDir = path.join(__dirname, '../uploads');
      const processedDir = path.join(__dirname, '../uploads/processed');
      
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.mkdir(processedDir, { recursive: true });
      
      // Create default admin user
      const adminUser: InsertUser = {
        username: "admin",
        password: "700700", // In production, this should be properly hashed
        email: "admin@imagemaster.com",
        fullName: "مدير النظام",
        role: "admin",
        subscription: "unlimited"
      };
      
      // Check if admin user already exists
      const existingAdmin = await this.getUserByUsername("admin");
      if (!existingAdmin) {
        await this.createUser(adminUser);
        console.log('Default admin user created successfully');
        
        // Create default subscription plans
        await this.createDefaultPaymentSettings();
      }
    } catch (error) {
      console.error('Error initializing storage:', error);
    }
  }
  
  // Create default payment settings and subscription plans
  private async createDefaultPaymentSettings() {
    try {
      // Add default payment gateways and subscription plans
      // This would be managed through the admin dashboard in actual implementation
      console.log('Default payment settings initialized');
    } catch (error) {
      console.error('Error creating default payment settings:', error);
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersByUsername.get(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.usersByEmail.get(email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const createdAt = new Date();
    const updatedAt = new Date();
    
    // Respect the provided role and subscription if they exist, otherwise use defaults
    const role = insertUser.role || 'user';
    const subscription = insertUser.subscription || 'free';
    
    // Default values for subscription related fields
    const subscriptionExpiresAt = null;
    const stripeCustomerId = null;
    const stripeSubscriptionId = null;
    const dailyUsageLimit = subscription === 'free' ? 10 : 
                           subscription === 'pro' ? 100 : 
                           subscription === 'business' ? 1000 : 
                           subscription === 'unlimited' ? -1 : 10;
    const maxFileSize = subscription === 'free' ? 10 * 1024 * 1024 : 
                       subscription === 'pro' ? 50 * 1024 * 1024 : 
                       subscription === 'business' ? 150 * 1024 * 1024 : 
                       subscription === 'unlimited' ? -1 : 10 * 1024 * 1024;
    const usageCount = 0;
    
    const user: User = { 
      ...insertUser, 
      id, 
      role,
      subscription,
      subscriptionExpiresAt,
      stripeCustomerId,
      stripeSubscriptionId,
      dailyUsageLimit,
      maxFileSize,
      usageCount,
      createdAt,
      updatedAt
    };
    
    this.users.set(id, user);
    this.usersByUsername.set(user.username, user);
    this.usersByEmail.set(user.email, user);
    
    return user;
  }
  
  // Image methods
  async getImage(id: number): Promise<Image | undefined> {
    return this.images.get(id);
  }

  async getImagesByUser(userId: number): Promise<Image[]> {
    return Array.from(this.images.values())
      .filter(image => image.userId === userId);
  }

  async createImage(image: InsertImage): Promise<Image> {
    const id = this.currentImageId++;
    const newImage: Image = { ...image, id, createdAt: new Date() };
    this.images.set(id, newImage);
    return newImage;
  }

  async deleteImage(id: number): Promise<boolean> {
    const image = this.images.get(id);
    if (!image) return false;
    
    try {
      await fs.unlink(image.filePath);
      this.images.delete(id);
      return true;
    } catch (error) {
      console.error('Error deleting image file:', error);
      return false;
    }
  }

  async deleteExpiredImages(): Promise<number> {
    const now = new Date();
    const expiredImages = Array.from(this.images.values())
      .filter(image => image.expiresAt < now);
    
    const expiredIds = expiredImages.map(img => img.id);
    
    // Also delete associated processed images
    const expiredProcessedImages = Array.from(this.processedImages.values())
      .filter(img => img.expiresAt < now || expiredIds.includes(img.originalImageId));
    
    // Delete files and remove from maps
    for (const image of expiredImages) {
      try {
        await fs.unlink(image.filePath);
        this.images.delete(image.id);
      } catch (error) {
        console.error(`Error deleting expired image ${image.id}:`, error);
      }
    }
    
    for (const processedImage of expiredProcessedImages) {
      try {
        await fs.unlink(processedImage.filePath);
        this.processedImages.delete(processedImage.id);
      } catch (error) {
        console.error(`Error deleting expired processed image ${processedImage.id}:`, error);
      }
    }
    
    return expiredImages.length + expiredProcessedImages.length;
  }
  
  // Processed image methods
  async getProcessedImage(id: number): Promise<ProcessedImage | undefined> {
    return this.processedImages.get(id);
  }

  async getProcessedImagesByOriginal(originalImageId: number): Promise<ProcessedImage[]> {
    return Array.from(this.processedImages.values())
      .filter(image => image.originalImageId === originalImageId);
  }

  async getProcessedImagesByUser(userId: number): Promise<ProcessedImage[]> {
    return Array.from(this.processedImages.values())
      .filter(image => image.userId === userId);
  }

  async createProcessedImage(processedImage: InsertProcessedImage): Promise<ProcessedImage> {
    const id = this.currentProcessedImageId++;
    const newImage: ProcessedImage = { ...processedImage, id, createdAt: new Date() };
    this.processedImages.set(id, newImage);
    return newImage;
  }

  async deleteProcessedImage(id: number): Promise<boolean> {
    const image = this.processedImages.get(id);
    if (!image) return false;
    
    try {
      await fs.unlink(image.filePath);
      this.processedImages.delete(id);
      return true;
    } catch (error) {
      console.error('Error deleting processed image file:', error);
      return false;
    }
  }
  
  // Stats methods
  async incrementToolUsage(toolName: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const key = `${toolName}_${today.toISOString().split('T')[0]}`;
    
    let statRecord = this.statsMap.get(key);
    
    if (!statRecord) {
      statRecord = {
        id: this.currentStatsId++,
        date: today,
        toolName,
        usageCount: 0
      };
      this.statsMap.set(key, statRecord);
    }
    
    statRecord.usageCount++;
  }

  async getToolStats(toolName: string): Promise<Stats[]> {
    return Array.from(this.statsMap.values())
      .filter(stat => stat.toolName === toolName)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async getAllStats(): Promise<Stats[]> {
    return Array.from(this.statsMap.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  // API Key methods
  async getApiKey(keyValue: string): Promise<ApiKey | undefined> {
    return this.apiKeysByValue.get(keyValue);
  }

  async getApiKeysByUser(userId: number): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values())
      .filter(key => key.userId === userId);
  }

  async createApiKey(apiKeyData: InsertApiKey): Promise<ApiKey> {
    const id = this.currentApiKeyId++;
    const keyValue = apiKeyData.keyValue || `imk_${uuidv4().replace(/-/g, '')}`;
    
    const apiKey: ApiKey = {
      ...apiKeyData,
      id,
      keyValue,
      createdAt: new Date(),
      active: true
    };
    
    this.apiKeys.set(id, apiKey);
    this.apiKeysByValue.set(keyValue, apiKey);
    
    return apiKey;
  }

  async updateApiKeyLastUsed(id: number): Promise<boolean> {
    const apiKey = this.apiKeys.get(id);
    if (!apiKey) return false;
    
    apiKey.lastUsed = new Date();
    return true;
  }

  async deleteApiKey(id: number): Promise<boolean> {
    const apiKey = this.apiKeys.get(id);
    if (!apiKey) return false;
    
    this.apiKeys.delete(id);
    this.apiKeysByValue.delete(apiKey.keyValue);
    
    return true;
  }

  // Subscription methods
  async updateUserSubscription(userId: number, subscriptionData: {
    subscription: string;
    subscriptionExpiresAt: Date | null;
    dailyUsageLimit?: number;
    maxFileSize?: number;
    stripeSubscriptionId?: string | null;
  }): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Update user with new subscription data
    user.subscription = subscriptionData.subscription;
    user.subscriptionExpiresAt = subscriptionData.subscriptionExpiresAt;
    
    // Update optional fields if provided
    if (subscriptionData.dailyUsageLimit !== undefined) {
      user.dailyUsageLimit = subscriptionData.dailyUsageLimit;
    }
    
    if (subscriptionData.maxFileSize !== undefined) {
      user.maxFileSize = subscriptionData.maxFileSize;
    }
    
    if (subscriptionData.stripeSubscriptionId !== undefined) {
      user.stripeSubscriptionId = subscriptionData.stripeSubscriptionId;
    }
    
    // Update last modified time
    user.updatedAt = new Date();
    
    // Return updated user
    return user;
  }

  async createSubscriptionLog(userId: number, subscriptionData: {
    planId: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    paymentMethod: string;
    amount: number;
  }): Promise<void> {
    const id = this.currentSubscriptionLogId++;
    
    // Create subscription log entry
    const logEntry = {
      id,
      userId,
      ...subscriptionData,
      createdAt: new Date()
    };
    
    // Store in the map
    this.subscriptionLogs.set(id, logEntry);
    
    // Also track as a statistic
    await this.incrementToolUsage(`subscription_${subscriptionData.planId}`);
  }

  // Site settings methods
  async getSiteSetting(key: string): Promise<SiteSetting | undefined> {
    return this.siteSettings.get(key);
  }

  async getAllSiteSettings(): Promise<SiteSetting[]> {
    return Array.from(this.siteSettings.values());
  }

  async createSiteSetting(setting: InsertSiteSetting): Promise<SiteSetting> {
    const id = 1; // Only used for the database storage version
    const updatedAt = new Date();
    
    const newSetting: SiteSetting = {
      ...setting,
      id,
      updatedAt
    };
    
    this.siteSettings.set(setting.key, newSetting);
    return newSetting;
  }

  async updateSiteSetting(key: string, value: any, updatedBy: number): Promise<SiteSetting | undefined> {
    const setting = this.siteSettings.get(key);
    
    if (!setting) {
      return undefined;
    }
    
    const updatedSetting: SiteSetting = {
      ...setting,
      value,
      updatedBy,
      updatedAt: new Date()
    };
    
    this.siteSettings.set(key, updatedSetting);
    return updatedSetting;
  }

  async deleteSiteSetting(key: string): Promise<boolean> {
    if (!this.siteSettings.has(key)) {
      return false;
    }
    
    return this.siteSettings.delete(key);
  }
}

export const storage = new MemStorage();
