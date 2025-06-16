/**
 * GameEffects.ts
 * مكون لإدارة المؤثرات الصوتية والبصرية في الألعاب
 */

// نوع لخيارات المؤثرات الصوتية
interface SoundOptions {
  volume?: number;
  loop?: boolean;
  pitch?: number;
}

/**
 * فئة لإدارة المؤثرات الصوتية في الألعاب
 */
export class GameSoundEffects {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private isMuted: boolean = false;
  private defaultVolume: number = 0.5;
  
  // هذه المجموعة تحتوي على جميع مسارات الصوت المتاحة
  private readonly soundPaths = {
    click: '/sounds/click.mp3',
    win: '/sounds/win.mp3',
    lose: '/sounds/lose.mp3',
    draw: '/sounds/draw.mp3',
    move: '/sounds/move.mp3',
    notification: '/sounds/notification.mp3',
    countdown: '/sounds/countdown.mp3',
    gameStart: '/sounds/game-start.mp3',
    gameOver: '/sounds/game-over.mp3',
    correct: '/sounds/correct.mp3',
    incorrect: '/sounds/incorrect.mp3',
    button: '/sounds/button.mp3'
  };
  
  /**
   * تهيئة المؤثرات الصوتية
   * @param preloadSounds - قائمة الأصوات التي يجب تحميلها مسبقًا
   */
  constructor(preloadSounds: string[] = []) {
    // تحميل الأصوات المحددة مسبقًا
    if (preloadSounds.length > 0) {
      preloadSounds.forEach(sound => {
        if (sound in this.soundPaths) {
          this.preloadSound(sound);
        }
      });
    }
    
    // تحقق من حالة كتم الصوت المحفوظة
    const savedMuteState = localStorage.getItem('gameSoundMuted');
    if (savedMuteState) {
      this.isMuted = savedMuteState === 'true';
    }
    
    // تحقق من مستوى الصوت المحفوظ
    const savedVolume = localStorage.getItem('gameSoundVolume');
    if (savedVolume) {
      this.defaultVolume = parseFloat(savedVolume);
    }
  }
  
  /**
   * تحميل صوت مسبقًا
   * @param soundName - اسم الصوت
   */
  private preloadSound(soundName: string): void {
    if (this.soundPaths[soundName as keyof typeof this.soundPaths]) {
      const audio = new Audio(this.soundPaths[soundName as keyof typeof this.soundPaths]);
      audio.preload = 'auto';
      this.sounds.set(soundName, audio);
    }
  }
  
  /**
   * تشغيل صوت معين
   * @param soundName - اسم الصوت
   * @param options - خيارات تشغيل الصوت
   */
  public playSound(soundName: string, options: SoundOptions = {}): void {
    // لا تشغل الأصوات إذا كانت في وضع كتم الصوت
    if (this.isMuted) return;
    
    // تحميل الصوت إذا لم يكن محملًا بالفعل
    if (!this.sounds.has(soundName)) {
      this.preloadSound(soundName);
    }
    
    // الحصول على عنصر الصوت
    const sound = this.sounds.get(soundName);
    
    if (sound) {
      // إعادة ضبط الصوت للتشغيل مرة أخرى
      sound.pause();
      sound.currentTime = 0;
      
      // تعيين خيارات الصوت
      sound.volume = options.volume !== undefined ? options.volume : this.defaultVolume;
      sound.loop = options.loop || false;
      
      // تشغيل الصوت
      sound.play().catch(error => {
        console.warn(`Failed to play sound ${soundName}:`, error);
      });
    }
  }
  
  /**
   * كتم أو إلغاء كتم جميع الأصوات
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    
    // حفظ حالة كتم الصوت
    localStorage.setItem('gameSoundMuted', this.isMuted.toString());
    
    // إيقاف جميع الأصوات الحالية إذا تم كتمها
    if (this.isMuted) {
      this.stopAllSounds();
    }
    
    return this.isMuted;
  }
  
  /**
   * التحقق مما إذا كانت الأصوات مكتومة
   */
  public isSoundMuted(): boolean {
    return this.isMuted;
  }
  
  /**
   * تعيين مستوى الصوت الافتراضي
   * @param volume - مستوى الصوت (0.0 - 1.0)
   */
  public setVolume(volume: number): void {
    this.defaultVolume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('gameSoundVolume', this.defaultVolume.toString());
  }
  
  /**
   * إيقاف جميع الأصوات
   */
  public stopAllSounds(): void {
    this.sounds.forEach(sound => {
      sound.pause();
      sound.currentTime = 0;
    });
  }
  
  /**
   * إيقاف صوت محدد
   * @param soundName - اسم الصوت
   */
  public stopSound(soundName: string): void {
    const sound = this.sounds.get(soundName);
    if (sound) {
      sound.pause();
      sound.currentTime = 0;
    }
  }
}

/**
 * فئة لإدارة المؤثرات البصرية في الألعاب
 */
export class GameVisualEffects {
  /**
   * إضافة تأثير للفوز على عنصر
   * @param element - عنصر DOM
   * @param duration - مدة التأثير بالمللي ثانية
   */
  public static addWinEffect(element: HTMLElement, duration: number = 2000): void {
    element.classList.add('win-effect');
    
    setTimeout(() => {
      element.classList.remove('win-effect');
    }, duration);
  }
  
  /**
   * إضافة تأثير للخسارة على عنصر
   * @param element - عنصر DOM
   * @param duration - مدة التأثير بالمللي ثانية
   */
  public static addLoseEffect(element: HTMLElement, duration: number = 1000): void {
    element.classList.add('lose-effect');
    
    setTimeout(() => {
      element.classList.remove('lose-effect');
    }, duration);
  }
  
  /**
   * إضافة تأثير للتعادل على عنصر
   * @param element - عنصر DOM
   * @param duration - مدة التأثير بالمللي ثانية
   */
  public static addDrawEffect(element: HTMLElement, duration: number = 1500): void {
    element.classList.add('draw-effect');
    
    setTimeout(() => {
      element.classList.remove('draw-effect');
    }, duration);
  }
  
  /**
   * إضافة تأثير نبضة على عنصر
   * @param element - عنصر DOM
   * @param color - لون النبضة
   * @param duration - مدة التأثير بالمللي ثانية
   */
  public static addPulseEffect(element: HTMLElement, color: string = 'rgba(139, 92, 246, 0.5)', duration: number = 1000): void {
    // حفظ الحدود الأصلية
    const originalBorder = element.style.border;
    const originalBoxShadow = element.style.boxShadow;
    
    // تطبيق تأثير النبضة
    element.style.border = `2px solid ${color}`;
    element.style.boxShadow = `0 0 10px ${color}`;
    element.style.transition = 'all 0.3s ease';
    
    // إعادة الحدود الأصلية
    setTimeout(() => {
      element.style.border = originalBorder;
      element.style.boxShadow = originalBoxShadow;
    }, duration);
  }
  
  /**
   * إضافة تأثير انتقال إلى عنصر
   * @param element - عنصر DOM
   * @param direction - اتجاه الانتقال ('up', 'down', 'left', 'right')
   * @param distance - مسافة الانتقال بالبكسل
   * @param duration - مدة التأثير بالمللي ثانية
   */
  public static addMoveEffect(element: HTMLElement, direction: 'up' | 'down' | 'left' | 'right', distance: number = 10, duration: number = 300): void {
    // حفظ الوضع الأصلي
    const originalPosition = element.style.position;
    const originalTransform = element.style.transform;
    
    // تعيين الوضع النسبي إذا لم يكن محددًا
    if (originalPosition !== 'relative' && originalPosition !== 'absolute') {
      element.style.position = 'relative';
    }
    
    // تحديد اتجاه الانتقال
    let transformValue = '';
    switch (direction) {
      case 'up':
        transformValue = `translateY(-${distance}px)`;
        break;
      case 'down':
        transformValue = `translateY(${distance}px)`;
        break;
      case 'left':
        transformValue = `translateX(-${distance}px)`;
        break;
      case 'right':
        transformValue = `translateX(${distance}px)`;
        break;
    }
    
    // تطبيق التأثير
    element.style.transform = transformValue;
    element.style.transition = `transform ${duration}ms ease`;
    
    // إعادة الوضع الأصلي
    setTimeout(() => {
      element.style.transform = originalTransform;
    }, duration);
  }
}

// كائن singleton للاستخدام في الألعاب
export const gameSoundEffects = new GameSoundEffects([
  'click', 'win', 'lose', 'move', 'notification'
]); 