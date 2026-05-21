package ai.clipdirector.ui.theme

import ai.clipdirector.data.job.JobStatus
import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * ClipDirector dark theme — see /DESIGN.md. Always dark; the brand is
 * cinematic-dark and there's no light theme.
 */
@Composable
fun ClipDirectorTheme(content: @Composable () -> Unit) {
    val colorScheme = darkColorScheme(
        primary = Primary,
        onPrimary = OnPrimary,
        primaryContainer = PrimaryContainer,
        onPrimaryContainer = OnPrimaryContainer,
        secondary = Secondary,
        onSecondary = OnSecondary,
        secondaryContainer = SecondaryContainer,
        onSecondaryContainer = OnSecondaryContainer,
        tertiary = Tertiary,
        onTertiary = OnTertiary,
        tertiaryContainer = TertiaryContainer,
        onTertiaryContainer = OnTertiaryContainer,
        error = ErrorColor,
        onError = OnErrorColor,
        errorContainer = ErrorContainer,
        onErrorContainer = OnErrorContainer,
        background = Surface,
        onBackground = OnSurface,
        surface = Surface,
        onSurface = OnSurface,
        surfaceVariant = SurfaceContainerHigh,
        onSurfaceVariant = OnSurfaceVariant,
        surfaceContainerLowest = SurfaceContainerLowest,
        surfaceContainerLow = SurfaceContainerLow,
        surfaceContainer = SurfaceContainer,
        surfaceContainerHigh = SurfaceContainerHigh,
        surfaceContainerHighest = SurfaceContainerHighest,
        surfaceDim = SurfaceDim,
        surfaceBright = SurfaceBright,
        outline = Outline,
        outlineVariant = OutlineVariant,
    )

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                window.statusBarColor = Surface.toArgb()
                window.navigationBarColor = Surface.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = ClipDirectorTypography,
        shapes = ClipDirectorShapes,
        content = content,
    )
}

/** Maps a [JobStatus] to its status-pill color from DESIGN.md. */
fun statusColor(status: JobStatus): Color = when (status) {
    JobStatus.QUEUED -> StatusQueued
    JobStatus.SAMPLING -> StatusSampling
    JobStatus.REASONING -> StatusReasoning
    JobStatus.RENDERING -> StatusRendering
    JobStatus.UPLOADING -> StatusUploading
    JobStatus.COMPLETE -> StatusComplete
    JobStatus.FAILED -> StatusFailed
}
