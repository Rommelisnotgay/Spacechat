// Define queue user type
interface QueueUser {
  userId: string;
  vibe: string;
  timestamp: number;
  reconnectionAttempts: number;
  lastMatchAttempt?: number;
}

// Create users queue
const queueUsers: QueueUser[] = [];

export function joinQueue(userId: string, vibe: string = 'any'): boolean {
  try {
    // Check if the user is already in the queue
    const existingUser = queueUsers.find((user: QueueUser) => user.userId === userId);
    if (existingUser) {
      console.log(`User ${userId} is already in queue`);
      // Update existing user
      existingUser.vibe = vibe;
      existingUser.timestamp = Date.now();
      existingUser.reconnectionAttempts = 0; // Reset reconnection attempts
      return true;
    }
    
    // Add user to queue
    queueUsers.push({ userId, vibe, timestamp: Date.now(), reconnectionAttempts: 0 });
    console.log(`User ${userId} joined queue with vibe: ${vibe}`);
    return true;
  } catch (error) {
    console.error(`Error joining queue: ${error}`);
    return false;
  }
}

export function matchUsers(): { userId1: string, userId2: string, vibe: string } | null {
  try {
    if (queueUsers.length < 2) {
      return null;
    }
    
    // Sort by timestamp (oldest first)
    queueUsers.sort((a: QueueUser, b: QueueUser) => a.timestamp - b.timestamp);
    
    // Update to prevent repeated matching
    const now = Date.now();
    // Filter users who have been matched recently (within the last 30 seconds)
    const availableUsers = queueUsers.filter(
      (user: QueueUser) => !user.lastMatchAttempt || now - user.lastMatchAttempt > 30000
    );
    
    if (availableUsers.length < 2) {
      return null;
    }
    
    // Basic matching logic (can be expanded)
    const user1 = availableUsers[0];
    const user2 = availableUsers[1];
    
    // Mark these users as recently matched
    user1.lastMatchAttempt = now;
    user2.lastMatchAttempt = now;
    
    // Add matching log
    console.log(`Matched users: ${user1.userId} and ${user2.userId} with vibe: ${user1.vibe}/${user2.vibe}`);
    
    return {
      userId1: user1.userId,
      userId2: user2.userId,
      vibe: `${user1.vibe}/${user2.vibe}`
    };
  } catch (error) {
    console.error(`Error matching users: ${error}`);
    return null;
  }
}

export function removeFromQueue(userId: string): boolean {
  const initialLength = queueUsers.length;
  const index = queueUsers.findIndex((user: QueueUser) => user.userId === userId);
  
  if (index !== -1) {
    queueUsers.splice(index, 1);
    console.log(`User ${userId} removed from queue`);
    return true;
  }
  
  return false;
} 