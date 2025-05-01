import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * API Key Authentication Middleware
 * Validates API keys from request header or query parameter
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from header or query parameter
    const apiKey = req.headers['x-api-key'] || req.query.api_key as string;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required',
        error: 'unauthorized'
      });
    }
    
    // Validate the API key
    const apiKeyRecord = await storage.getApiKey(apiKey);
    
    if (!apiKeyRecord || !apiKeyRecord.active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API key',
        error: 'unauthorized'
      });
    }
    
    // Attach API key and user info to the request for later use
    (req as any).apiKey = apiKeyRecord;
    (req as any).apiUserId = apiKeyRecord.userId;
    
    // Log API key usage
    await storage.updateApiKeyLastUsed(apiKeyRecord.id);
    
    // Continue to the actual API endpoint
    next();
  } catch (error) {
    console.error('API auth error:', error);
    res.status(500).json({
      success: false,
      message: 'API authentication error',
      error: 'server_error'
    });
  }
}

/**
 * Check if the user has permission to execute based on their subscription
 */
export async function subscriptionCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).apiUserId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in request',
        error: 'unauthorized'
      });
    }
    
    // Get the user to check their subscription
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        error: 'unauthorized'
      });
    }
    
    // Check if subscription is valid
    const now = new Date();
    if (user.subscription !== 'premium' && user.subscription !== 'pro' && 
        (!user.subscriptionExpiresAt || user.subscriptionExpiresAt < now)) {
      return res.status(403).json({
        success: false,
        message: 'This API call requires an active subscription',
        error: 'subscription_required'
      });
    }
    
    // Attach user to request
    (req as any).apiUser = user;
    
    // Continue to the API endpoint
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking subscription',
      error: 'server_error'
    });
  }
}