// Kotlin 2.0+ required because the Compose Compiler is a standalone Gradle
// plugin (org.jetbrains.kotlin.plugin.compose) starting with that version.
// Phase 0 scaffold pinned 1.9.24 which references the plugin but predates it.
plugins {
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    // Phase 10: @Serializable code-gen for Retrofit kotlinx-serialization-converter
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}
