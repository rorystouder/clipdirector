package ai.clipdirector.ui.clips

import ai.clipdirector.data.job.SubmissionDraft
import android.content.ContentResolver
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ClipPick(
    val uri: Uri,
    val durationMs: Long, // -1 if unknown
)

class ClipSelectViewModel(
    private val contentResolver: ContentResolver,
    private val submissionDraft: SubmissionDraft,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    private val _clips = MutableStateFlow<List<ClipPick>>(emptyList())
    val clips: StateFlow<List<ClipPick>> = _clips.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val totalDurationMs: StateFlow<Long> = MutableStateFlow(0L).also { flow ->
        viewModelScope.launch {
            _clips.collect { list ->
                flow.value = list.sumOf { (it.durationMs).coerceAtLeast(0L) }
            }
        }
    }.asStateFlow()

    fun setSelection(uris: List<Uri>) {
        if (uris.isEmpty()) return
        if (uris.size > MAX_CLIPS) {
            _error.value = "Maximum $MAX_CLIPS clips per job"
            return
        }
        _error.value = null
        viewModelScope.launch {
            val picks = withContext(ioDispatcher) {
                uris.map { uri -> ClipPick(uri, readDurationMs(uri)) }
            }
            _clips.value = picks
        }
    }

    fun remove(uri: Uri) {
        _clips.value = _clips.value.filter { it.uri != uri }
    }

    fun clear() {
        _clips.value = emptyList()
        _error.value = null
    }

    fun confirmAndProceed(onValid: () -> Unit) {
        val current = _clips.value
        if (current.isEmpty()) {
            _error.value = "Select at least one clip"
            return
        }
        if (current.size > MAX_CLIPS) {
            _error.value = "Maximum $MAX_CLIPS clips per job"
            return
        }
        // Per gateway: MAX_RAW_FOOTAGE_MINUTES default 5 → 300s → 300_000 ms.
        // Soft warning here; gateway will reject hard.
        submissionDraft.setClips(current.map { it.uri })
        onValid()
    }

    private fun readDurationMs(uri: Uri): Long = runCatching {
        MediaMetadataRetriever().use { mmr ->
            mmr.setDataSource(contentResolver.openAssetFileDescriptor(uri, "r")!!.fileDescriptor)
            mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: -1L
        }
    }.getOrDefault(-1L)

    companion object {
        const val MAX_CLIPS = 12
    }
}
