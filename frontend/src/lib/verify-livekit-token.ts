import * as jose from 'jose';

interface LiveKitTokenPayload {
  sub: string;       // identity
  iss: string;       // API key
  video?: {
    room?: string;
    roomJoin?: boolean;
    roomAdmin?: boolean;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
  };
}

/**
 * Verifies a LiveKit JWT token using the LIVEKIT_API_SECRET.
 * Returns the decoded payload if valid, or null if invalid.
 *
 * The LiveKit server SDK signs JWTs with HS256 using the API secret.
 */
export async function verifyLiveKitToken(
  token: string
): Promise<LiveKitTokenPayload | null> {
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!secret) {
    console.error('LIVEKIT_API_SECRET is not set');
    return null;
  }

  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return payload as unknown as LiveKitTokenPayload;
  } catch (err) {
    console.error('LiveKit token verification failed:', err);
    return null;
  }
}
