# ClipDirector music library

Drop royalty-free `.mp3` tracks under each mood directory. The render-worker's
filesystem music selector reads `${MUSIC_LIBRARY_PATH}/<mood>/*.mp3` and picks
a track deterministically from the jobId.

```
music/
├── energetic/   # uptempo, drum-driven
├── chill/       # ambient, low-bpm
├── nostalgic/   # warm, melodic
└── cinematic/   # orchestral, sweeping
```

CI tests synthesize their own music via `ffmpeg lavfi sine` — no files are
required for the suite to pass.
