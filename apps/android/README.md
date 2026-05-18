# ClipDirector — Android Client (scaffold)

This is the Phase 0 scaffold only. Per the PRD (Section 15 / `⚠ WARNING`), full UI and business logic are Phase 2.

## What's here

- Gradle 8.5 + AGP 8.5 + Kotlin 1.9.24 + Compose BOM 2024.06.
- Five screen stubs (`ClipSelect`, `Prompt`, `Processing`, `Preview`, `History`), wired into a minimal NavHost.
- `ClipDirectorApi` Retrofit interface matching `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/download`.
- Dependencies declared for: Retrofit + OkHttp, kotlinx.serialization, Media3 ExoPlayer, Coil.

## What's missing intentionally

- Gradle wrapper jar/script (run `gradle wrapper --gradle-version 8.7` once you have JDK 17+ installed; the host currently has JDK 1.8 which won't build AGP 8.x).
- ViewModels, repository layer, DI.
- Real MediaStore integration, ExoPlayer playback, upload progress.
- Auth flow.

## Build prereqs (Phase 2)

- Android Studio Koala+ or `cmdline-tools` with `platforms;android-34` and `build-tools;34.0.0`.
- JDK 17.
- `local.properties` pointing at the Android SDK.
