# ClipDirector — Android Client

End-to-end Kotlin + Compose client for the ClipDirector backend. Implements registration, login, video picking, job submission with upload progress, status polling, ExoPlayer playback of the rendered MP4, and a history list of past jobs. Talks to the gateway built in Phases 0-8.

## What's here (Phase 10 complete)

- Kotlin 2.0.21 + AGP 8.5 + Compose BOM 2024.06 + Material3.
- Hand-rolled DI (`AppContainer` / ServiceLocator pattern — no Hilt at this scale).
- Two-OkHttpClient design: unauthed for `/auth/refresh`, authed (Bearer interceptor + 401-refresh `Authenticator`) for everything else.
- DataStore-backed `TokenStore` (access + refresh + email) and `JobIdStore` (history list, 100 cap).
- Five screens fully implemented: `ClipSelect` (PhotoPicker, 1–12 clips), `Prompt` (form + multipart submit with progress), `Processing` (2s polling), `Preview` (ExoPlayer in DisposableEffect + share), `History` (DataStore-backed, hydrated against gateway).
- New auth screens (`Login`, `Register`) plus auth-gated NavHost.
- 20 unit tests (MockWebServer + Turbine + TestDispatcher); ./gradlew :app:assembleDebug and :app:lintDebug both clean.

## Run the app

### Prereqs
- JDK 17, Android SDK 34, `local.properties`, gradle wrapper (all per the Phase 9 walkthrough below).
- The gateway running locally: from repo root, `cd infra/compose && docker compose --env-file .env up -d`. Confirm `curl http://localhost:3000/health` returns 200.

### Pick an Android target

**Emulator (Android 13+ recommended):** The debug build hardcodes `API_BASE_URL=http://10.0.2.2:3000/` — that's the special emulator address pointing at the host's `localhost`. Just install and run, no extra config.

```bash
cd apps/android
./gradlew :app:installDebug
adb shell am start -n ai.clipdirector/.MainActivity
```

**Real device (USB-debugging or wireless):** The device doesn't know about `10.0.2.2`. Use `adb reverse` to forward the device's port 3000 to your laptop's port 3000:

```bash
adb reverse tcp:3000 tcp:3000
./gradlew :app:installDebug
```

The app still uses `http://10.0.2.2:3000/` — that hostname resolves via the reverse mapping to your laptop. Disconnect = mapping gone, app loses gateway.

### Smoke test (manual, 2 minutes)

1. Open the app — it should start at the Login screen.
2. Tap "Don't have an account? Register" → enter `e2e@example.com` + 12+ char password → "Create account". App should navigate to Clip Select.
3. Tap "Pick videos" → PhotoPicker → select 1–2 short videos. Thumbnails should appear with durations.
4. Tap "Next" → on Prompt screen, type a prompt like `snappy 6 second highlight cut`, leave platform/mood/style at defaults → "Submit".
5. Upload progress bar should fill. App navigates to Processing screen, showing status text + percentage. Sub-15 seconds total against a local docker stack.
6. On completion, app navigates to Preview. ExoPlayer should auto-play the rendered MP4. Try the "Share download link" button.
7. Tap "Make another" → back to Clip Select. Verify History row in the nav (or however you've exposed it) shows the just-completed job.
8. Force-stop the app (`adb shell am force-stop ai.clipdirector`) and re-open → should still be logged in (TokenStore persists). History should still show the past job (JobIdStore persists).

### Reading logs

`adb logcat -s ai.clipdirector:V` for app logs. The OkHttp logging interceptor is on in debug builds, so every request + response (including bodies — beware secrets in shared screenshots) is logged.

---

## Build setup (Phase 9 walkthrough)

These steps are required once per host. They were not done during the Phase 0 scaffold because the host had JDK 1.8 at the time, which AGP 8.x rejects.

### 1. Install JDK 17

Pick one path; both work.

```bash
# Option A — apt (simplest on Ubuntu/Debian WSL):
sudo apt update
sudo apt install -y openjdk-17-jdk-headless

# Option B — SDKMAN (per-user, no sudo, easy version switching):
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java 17.0.12-tem
```

Then in your shell rc (`~/.bashrc` or `~/.zshrc`):

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64   # adjust for SDKMAN: ~/.sdkman/candidates/java/current
export PATH=$JAVA_HOME/bin:$PATH
```

Verify:

```bash
java -version    # → openjdk version "17.x.x" or "21.x.x"
javac -version   # → javac 17.x.x
```

### 2. Install Android command-line tools + SDK 34

```bash
# Create the install location
export ANDROID_HOME="$HOME/android-sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"

# Download cmdline-tools (check developer.android.com/studio#command-tools for the current URL)
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"

# Add to PATH and persist in your shell rc
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Append `ANDROID_HOME` / `ANDROID_SDK_ROOT` / `PATH` lines to your shell rc so future shells inherit them.

Accept licenses + install the SDK pieces we need:

```bash
yes | sdkmanager --licenses
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```

### 3. Install system Gradle (one-time, only to bootstrap the wrapper)

```bash
# Via SDKMAN (recommended):
sdk install gradle 8.7

# Verify
gradle --version    # → Gradle 8.7
```

### 4. Generate the Gradle wrapper

```bash
cd apps/android
gradle wrapper --gradle-version 8.7 --distribution-type all
```

This creates:
- `apps/android/gradlew` (shell)
- `apps/android/gradlew.bat` (Windows, harmless on Linux)
- `apps/android/gradle/wrapper/gradle-wrapper.jar`
- `apps/android/gradle/wrapper/gradle-wrapper.properties`

After this, **`gradle` is no longer needed** — `./gradlew` self-bootstraps for everyone who clones the repo.

### 5. Create `local.properties`

```bash
cat > apps/android/local.properties <<EOF
sdk.dir=$ANDROID_HOME
EOF
```

`local.properties` is in `.gitignore` (it's machine-specific) and **must not be committed**.

### 6. Build

```bash
cd apps/android
./gradlew :app:assembleDebug
```

Expected: exits 0, produces `app/build/outputs/apk/debug/app-debug.apk` (a few MB). First run downloads gradle 8.7 and all dependencies — expect 5-15 minutes depending on bandwidth. Subsequent builds are seconds.

Quick lint pass:

```bash
./gradlew :app:lintDebug
```

Minor warnings on the `// TODO` placeholders are acceptable. Critical findings should be triaged.

### 7. Commit the wrapper

Once the build is green:

```bash
git add apps/android/gradlew apps/android/gradlew.bat apps/android/gradle/wrapper/
git commit -m "feat(phase-9): generated gradle wrapper for android scaffold"
```

From this point on, anyone cloning the repo can `cd apps/android && ./gradlew :app:assembleDebug` without installing system gradle. JDK 17 + Android SDK 34 are still prereqs.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not target platform: 'Java SE 17'` | JAVA_HOME still points at JDK 8 | `export JAVA_HOME=...` to the 17 install; restart shell |
| `SDK location not found` | Missing `local.properties` or wrong `ANDROID_HOME` | re-do step 5; check `echo $ANDROID_HOME` resolves to an existing dir |
| `Failed to install the following Android SDK packages... license not accepted` | Skipped step 2's `--licenses` | Re-run `yes \| sdkmanager --licenses` |
| `Could not resolve all dependencies` (com.android.application) | Behind a corporate proxy | Set `gradle.properties`: `systemProp.http.proxyHost=...` etc. |
| `JAVA_HOME` not set or wrong on later shell sessions | rc file not sourced | Verify the export lines are in `~/.bashrc`/`~/.zshrc` and restart the shell |

## Future work (Phase 11+)

Phase 10 ships a usable client but deliberately defers production-grade resilience:

- **WorkManager + foreground service for upload resilience under process death.** Today, if the app is force-killed or backgrounded mid-upload, the upload aborts. A `OneTimeWorkRequest` with `setExpedited` would survive that. Biggest gap.
- **Push notifications for job completion** — currently the user has to keep the app open or come back and check.
- **Multi-account / account switcher** — `TokenStore` holds one set of tokens.
- **Tablet / landscape-specific layouts** — Compose default scaling works but isn't tuned.
- **Crashlytics / analytics** — no instrumentation today.
- **ProGuard/R8 release-mode optimization** — `isMinifyEnabled = false` in `release` buildType; needs rules + audit before shipping.
- **Localization / RTL** — strings inlined, English only.
- **Accessibility audit beyond Compose defaults.**
- **Bump deps** — lint flags newer versions of `activity-compose`, `navigation-compose`, `lifecycle-*`, `datastore-preferences`, `security-crypto`, `media3-*`. None urgent, all worth picking up in a maintenance pass.
- **Android 14 partial-access UX for Selected Photos Access.** Out of scope because we use PhotoPicker which sidesteps the partial-grant flow; revisit if we ever query MediaStore directly.
