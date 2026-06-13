import { AccessToken } from 'livekit-server-sdk';

export async function createLiveKitToken(
  identity: string,
  name: string,
  roomName: string,
  isAgent: boolean = false
) {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      name,
    }
  );

  if (isAgent) {
    at.addGrant({
      roomJoin: true,
      roomAdmin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // explicit omit: canRecord is false by default, recording is handled server-side
    });
  } else {
    // Customer
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false,
    });
  }

  return await at.toJwt();
}
