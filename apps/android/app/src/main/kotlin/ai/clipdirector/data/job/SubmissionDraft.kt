package ai.clipdirector.data.job

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-scoped holder for the in-flight submission's selected clip URIs.
 *
 * URIs aren't trivially serializable as nav arguments (they may be content://
 * URIs with revocable permissions), so the ClipSelect → Prompt handoff goes
 * through this singleton instead of a nav string. JobId-based routes (Processing
 * → Preview) still use plain nav args because jobId is a UUID string.
 *
 * Lifetime is process lifetime — clear() should be called after successful
 * submit (so a back-button to Clips shows an empty draft).
 */
class SubmissionDraft {
    private val _clips = MutableStateFlow<List<Uri>>(emptyList())
    val clips: StateFlow<List<Uri>> = _clips.asStateFlow()

    fun setClips(uris: List<Uri>) {
        _clips.value = uris
    }

    fun clear() {
        _clips.value = emptyList()
    }
}
