# ClipDirector — Android Client

Phase 0 created the scaffold (Kotlin + Compose + Retrofit + ExoPlayer dependencies, five screen stubs, `ClipDirectorApi` interface). **Phase 9** (PRD items 59-66) is the toolchain + build-verification work that gets the scaffold compiling against a real Android SDK. Actual screen implementation is deferred to a future Phase 10 amendment.

## What's here

- Gradle 8.5 + AGP 8.5 + Kotlin 1.9.24 + Compose BOM 2024.06.
- Five screen stubs (`ClipSelect`, `Prompt`, `Processing`, `Preview`, `History`), wired into a minimal NavHost.
- `ClipDirectorApi` Retrofit interface matching `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/download`.
- Dependencies declared for: Retrofit + OkHttp, kotlinx.serialization, Media3 ExoPlayer, Coil.

## What's still missing (Phase 10+)

- ViewModels, repository layer, DI.
- Real MediaStore integration, ExoPlayer playback, upload progress.
- Auth flow (register / login / refresh-token rotation).
- History persistence.

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

## Future work (Phase 10+)

The actual app is unimplemented — every screen file has `// TODO Phase 2` placeholders. Phase 10 should:

- Implement the auth flow against the gateway (`/auth/register`, `/auth/login`, refresh-token rotation).
- Wire `ClipSelectScreen` to MediaStore for picking up to 12 video clips.
- Implement upload via Retrofit multipart, with progress feedback.
- Implement polling in `ProcessingScreen` against `GET /jobs/:id`.
- Implement `PreviewScreen` with ExoPlayer playing the presigned-download MP4.
- Persist job history locally (Room) and render `HistoryScreen` against it.
- Add ViewModels + a small DI layer (Hilt or manual).
