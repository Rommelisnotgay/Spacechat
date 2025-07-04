import { ref } from 'vue';

// Check if localStorage is available
function isLocalStorageAvailable(): boolean {
  const test = 'test';
  try {
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.error('localStorage is not available:', e);
    return false;
  }
}

/**
 * A wrapper for localStorage with error handling
 */
export function useLocalStorage() {
  const isAvailable = ref(isLocalStorageAvailable());
  
  /**
   * Set an item in localStorage
   */
  function setItem(key: string, value: string): void {
    if (!isAvailable.value) {
      console.warn('localStorage is not available, cannot set item');
      return;
    }
    
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Failed to set localStorage item:', error);
    }
  }
  
  /**
   * Get an item from localStorage
   */
  function getItem(key: string): string | null {
    if (!isAvailable.value) {
      console.warn('localStorage is not available, cannot get item');
      return null;
    }
    
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Failed to get localStorage item:', error);
      return null;
    }
  }
  
  /**
   * Remove an item from localStorage
   */
  function removeItem(key: string): void {
    if (!isAvailable.value) {
      console.warn('localStorage is not available, cannot remove item');
      return;
    }
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove localStorage item:', error);
    }
  }
  
  /**
   * Clear all items from localStorage
   */
  function clear(): void {
    if (!isAvailable.value) {
      console.warn('localStorage is not available, cannot clear storage');
      return;
    }
    
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }
  
  return {
    isAvailable,
    setItem,
    getItem,
    removeItem,
    clear
  };
}

/**
 * Save a call record to history
 * @param partnerId The ID of the call partner
 * @param duration The call duration in seconds
 * @param gamesPlayed Array of games played during the call
 */
export function saveCallToHistory(partnerId: string, duration: number, gamesPlayed: string[] = []): void {
  const { getItem, setItem } = useLocalStorage();
  
  try {
    // Get existing history
    const existingHistory = getItem('callHistory');
    let history: any[] = [];
    
    if (existingHistory) {
      history = JSON.parse(existingHistory);
    }
    
    // Create new history entry
    const newEntry = {
      partnerId,
      timestamp: new Date().toISOString(),
      duration,
      gamesPlayed
    };
    
    // Add to history (at the beginning)
    history.unshift(newEntry);
    
    // Limit history to last 20 entries
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    // Save updated history
    setItem('callHistory', JSON.stringify(history));
  } catch (error) {
    console.error('Error saving call to history:', error);
  }
}

/**
 * وظائف إدارة حالة كتم الصوت
 */
export function useMicrophoneState() {
  const { getItem, setItem } = useLocalStorage();
  const MICROPHONE_MUTE_KEY = 'spacechat_microphone_muted';

  /**
   * حفظ حالة كتم الصوت
   */
  function saveMicrophoneState(isMuted: boolean): void {
    setItem(MICROPHONE_MUTE_KEY, isMuted ? 'true' : 'false');
  }

  /**
   * استرجاع حالة كتم الصوت المحفوظة
   */
  function getSavedMicrophoneState(): boolean | null {
    const savedState = getItem(MICROPHONE_MUTE_KEY);
    if (savedState === null) return null;
    return savedState === 'true';
  }

  /**
   * تطبيق حالة كتم الصوت المحفوظة على الاتصال الحالي
   */
  function applySavedMicrophoneState(toggleMicrophone: () => Promise<boolean>): Promise<void> {
    return new Promise<void>(async (resolve) => {
      try {
        const savedState = getSavedMicrophoneState();
        if (savedState !== null) {
          console.log(`[Storage] Found saved microphone state: ${savedState ? 'muted' : 'unmuted'}`);
          // استدعاء toggleMicrophone فقط إذا كانت الحالة المحفوظة هي كتم الصوت
          // لأن الافتراضي هو أن الميكروفون غير مكتوم
          if (savedState === true) {
            await toggleMicrophone();
          }
        }
      } catch (error) {
        console.error('[Storage] Error applying saved microphone state:', error);
      }
      resolve();
    });
  }

  return {
    saveMicrophoneState,
    getSavedMicrophoneState,
    applySavedMicrophoneState
  };
}
