# Sound Files for Word Galaxy Game

The Word Galaxy game uses various sound effects to enhance the gaming experience. The sound files should be placed in the `client/public/sounds/` directory.

## Required Sound Files

The following sound files are needed for the Word Galaxy game:

1. `button.mp3` - Button click sound (already exists)
2. `notification.mp3` - Notification sound (already exists)
3. `win.mp3` - Sound played when the player wins
4. `lose.mp3` - Sound played when the player loses
5. `move.mp3` - Sound played when making a move
6. `correct.mp3` - Sound played for correct guesses
7. `incorrect.mp3` - Sound played for incorrect guesses
8. `game-start.mp3` - Sound played when the game starts
9. `game-over.mp3` - Sound played when the game ends

## Where to Get Sound Files

You can download free sound effects from the following websites:

1. [Mixkit](https://mixkit.co/free-sound-effects/game/) - Free game sound effects
2. [Freesound](https://freesound.org/) - A collaborative database of Creative Commons Licensed sounds
3. [SoundBible](https://soundbible.com/) - Free sound clips, sound bites, and sound effects

## How to Add Sound Files

1. Download the sound files from one of the sources mentioned above
2. Rename them according to the required file names
3. Place them in the `client/public/sounds/` directory
4. Make sure they are in MP3 format for compatibility

## Using Sound Effects in the Game

The game uses the `GameSoundEffects` class from `GameEffects.ts` to play sounds. Here's how sounds are played:

```javascript
// Play a sound
gameSoundEffects.playSound('win');

// Play a sound with options
gameSoundEffects.playSound('notification', { volume: 0.7, loop: false });

// Stop all sounds
gameSoundEffects.stopAllSounds();

// Toggle mute
gameSoundEffects.toggleMute();
```

If you need to add more sound effects, update the `soundPaths` object in the `GameSoundEffects` class in `GameEffects.ts`.
