package ai.clipdirector

import android.app.Application

/**
 * Process-wide entry point. Holds the [AppContainer] (manual DI).
 * Accessed from any [android.content.Context] via [appContainer].
 */
class ClipDirectorApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
