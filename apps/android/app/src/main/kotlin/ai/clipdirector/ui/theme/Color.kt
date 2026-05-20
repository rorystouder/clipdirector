package ai.clipdirector.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Color tokens from /DESIGN.md ("ClipDirector Cinematic"). One source of truth:
 * if you change a value here, change it in DESIGN.md too.
 */

// Surfaces — Material 3 dark hierarchy. Near-black with a slight cool undertone.
val Surface = Color(0xFF0E0F12)
val SurfaceDim = Color(0xFF0A0B0E)
val SurfaceBright = Color(0xFF262A31)
val SurfaceContainerLowest = Color(0xFF08090C)
val SurfaceContainerLow = Color(0xFF13151A)
val SurfaceContainer = Color(0xFF181B21)
val SurfaceContainerHigh = Color(0xFF23262D)
val SurfaceContainerHighest = Color(0xFF2E323A)

// Foreground on dark surfaces.
val OnSurface = Color(0xFFE6E7EB)
val OnSurfaceVariant = Color(0xFFA8ADB6)
val OnSurfaceMuted = Color(0xFF6E7480)
val Outline = Color(0xFF3A3F47)
val OutlineVariant = Color(0xFF2A2D33)

// Primary — "Clapperboard Orange." The single accent on every screen.
val Primary = Color(0xFFF26B1F)
val OnPrimary = Color(0xFF1A0C00)
val PrimaryContainer = Color(0xFF5C2A0A)
val OnPrimaryContainer = Color(0xFFFFDDC4)
val PrimaryFixed = Color(0xFFFFA170)
val PrimaryFixedDim = Color(0xFFF26B1F)

// Secondary — "Studio Cyan." Info chrome only.
val Secondary = Color(0xFF4DD0E1)
val OnSecondary = Color(0xFF00363D)
val SecondaryContainer = Color(0xFF0F4751)
val OnSecondaryContainer = Color(0xFFA8E8F0)

// Tertiary — "Stage Violet." Decorative-only, never a control.
val Tertiary = Color(0xFFB49CFF)
val OnTertiary = Color(0xFF1E1245)
val TertiaryContainer = Color(0xFF2E1B6B)
val OnTertiaryContainer = Color(0xFFDDD2FF)

// Semantic.
val ErrorColor = Color(0xFFFF6B6B)
val OnErrorColor = Color(0xFF3D0000)
val ErrorContainer = Color(0xFF5C0A0A)
val OnErrorContainer = Color(0xFFFFCFCF)
val SuccessColor = Color(0xFF2ECC71)
val OnSuccessColor = Color(0xFF003315)
val SuccessContainer = Color(0xFF0F4426)
val OnSuccessContainer = Color(0xFFA8E8C4)

// JobStatus pill colors — one per enum value so a history list scans by color.
val StatusQueued = Color(0xFF6E7480)
val StatusSampling = Color(0xFF4DD0E1)
val StatusReasoning = Color(0xFFB49CFF)
val StatusRendering = Color(0xFFF26B1F)
val StatusUploading = Color(0xFFFFA170)
val StatusComplete = Color(0xFF2ECC71)
val StatusFailed = Color(0xFFFF6B6B)
