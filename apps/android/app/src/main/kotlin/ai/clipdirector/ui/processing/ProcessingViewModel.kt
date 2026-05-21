package ai.clipdirector.ui.processing

import ai.clipdirector.data.job.JobRepository
import ai.clipdirector.data.job.JobStatus
import ai.clipdirector.data.job.JobStatusResponse
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.coroutines.coroutineContext

class ProcessingViewModel(
    private val jobRepository: JobRepository,
) : ViewModel() {

    sealed interface State {
        data object Connecting : State
        data class Polling(val response: JobStatusResponse) : State
        data class Complete(val response: JobStatusResponse) : State
        data class Failed(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Connecting)
    val state: StateFlow<State> = _state.asStateFlow()

    fun watch(jobId: String) {
        viewModelScope.launch {
            val startNs = System.nanoTime()
            while (coroutineContext.isActive) {
                val result = runCatching { jobRepository.getJobStatus(jobId) }
                val response = result.getOrNull()
                if (response == null) {
                    _state.value = State.Failed(
                        result.exceptionOrNull()?.message ?: "Could not reach gateway"
                    )
                    return@launch
                }
                _state.value = when (response.status) {
                    JobStatus.COMPLETE -> { State.Complete(response) }
                    JobStatus.FAILED -> {
                        State.Failed(response.errorMessage ?: "Job failed without a message")
                    }
                    else -> State.Polling(response)
                }
                if (response.status.isTerminal) return@launch
                delay(pollInterval(System.nanoTime() - startNs))
            }
        }
    }

    /**
     * Taper polling: tight at first (responsive UX while the job spins up),
     * relaxed for longer renders (saves request count + battery).
     *
     *   first 30 s:  every 2 s   (15 reqs)
     *   30 – 90 s:   every 5 s   (12 reqs)
     *   beyond:      every 10 s
     *
     * For a 10-min job: 15 + 12 + ~54 = ~81 reqs vs 300 at the flat 2 s
     * rate. ~73% reduction with no perceptible UX loss for typical jobs
     * that finish in <60 s.
     */
    private fun pollInterval(elapsedNs: Long): Long {
        val elapsedMs = elapsedNs / 1_000_000L
        return when {
            elapsedMs < 30_000L -> POLL_FAST_MS
            elapsedMs < 90_000L -> POLL_MEDIUM_MS
            else -> POLL_SLOW_MS
        }
    }

    companion object {
        const val POLL_FAST_MS = 2_000L
        const val POLL_MEDIUM_MS = 5_000L
        const val POLL_SLOW_MS = 10_000L
    }
}
