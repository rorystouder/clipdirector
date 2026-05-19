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
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    companion object {
        const val POLL_INTERVAL_MS = 2_000L
    }
}
