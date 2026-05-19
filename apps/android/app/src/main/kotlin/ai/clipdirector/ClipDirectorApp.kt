package ai.clipdirector

import android.app.Application

/**
 * Application subclass. In Phase 10.2 this will lazily construct an
 * [AppContainer] holding TokenStore + NetworkModule + repositories.
 * For now it's a no-op stub so the manifest's [android:name] reference resolves.
 */
class ClipDirectorApp : Application()
