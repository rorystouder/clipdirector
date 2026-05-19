package ai.clipdirector.ui.history

import ai.clipdirector.data.job.JobIdStore
import ai.clipdirector.data.job.JobRepository
import ai.clipdirector.data.job.JobStatusResponse
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class HistoryEntry(
    val jobId: String,
    val status: JobStatusResponse?, // null while loading
    val error: String?,
)

class HistoryViewModel(
    private val jobIdStore: JobIdStore,
    private val jobRepository: JobRepository,
) : ViewModel() {

    private val _entries = MutableStateFlow<List<HistoryEntry>>(emptyList())
    val entries: StateFlow<List<HistoryEntry>> = _entries.asStateFlow()

    init {
        viewModelScope.launch {
            jobIdStore.jobIds.collectLatest { ids ->
                _entries.value = ids.map { HistoryEntry(it, status = null, error = null) }
                // Lazily fetch status for each.
                ids.forEach { jobId ->
                    launch { hydrate(jobId) }
                }
            }
        }
    }

    private suspend fun hydrate(jobId: String) {
        val result = runCatching { jobRepository.getJobStatus(jobId) }
        _entries.value = _entries.value.map { entry ->
            if (entry.jobId != jobId) entry
            else result.fold(
                onSuccess = { entry.copy(status = it, error = null) },
                onFailure = { entry.copy(status = null, error = it.message) },
            )
        }
    }
}
