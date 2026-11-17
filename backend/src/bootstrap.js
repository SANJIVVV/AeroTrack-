/**
 * APPLICATION BOOTSTRAP MODULE
 * -----------------------------
 * Initializes all core services when the server starts:
 * 1. Loads and validates environment variables from .env
 * 2. Connects to MongoDB Atlas database
 * 3. Sets up email service (OTP codes for login)
 * 4. Loads the ML delay prediction model (if configured)
 * Returns a 'ctx' (context) object shared across the entire application.
 */
import { loadEnv } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createEmailSender } from './integrations/email/index.js';
import { loadDelayModel } from './services/prediction.js';

export async function bootstrap() {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  return {
    env,
    email: createEmailSender(env),
    delayModel: await loadDelayModel(env.DELAY_MODEL_PATH),
    now: () => new Date(),
  };
}
